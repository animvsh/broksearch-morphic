import { NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/get-current-user'
import { BrokCalendarEvent } from '@/lib/brokmail/google-calendar-client'
import {
  executeComposioTool,
  isComposioConfigured,
  listConnectedAccounts
} from '@/lib/integrations/composio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const DEFAULT_GCAL_TOOLKITS = [
  'googlecalendar',
  'googlesuper',
  'google-calendar',
  'google_calendar',
  'gcal',
  'calendar'
]

const DEFAULT_EVENT_TOOL_SLUGS = [
  'GOOGLECALENDAR_LIST_EVENTS',
  'GOOGLE_CALENDAR_LIST_EVENTS',
  'GOOGLECALENDAR_FIND_EVENT',
  'GOOGLE_CALENDAR_FIND_EVENT'
]

function resolveCalendarToolkits() {
  const configured = process.env.COMPOSIO_GCAL_TOOLKIT_SLUGS?.trim()
  if (!configured) return DEFAULT_GCAL_TOOLKITS

  const candidates = configured
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean)

  return candidates.length > 0 ? candidates : DEFAULT_GCAL_TOOLKITS
}

function resolveEventToolSlugs() {
  const configured = process.env.COMPOSIO_GCAL_EVENTS_TOOL_SLUGS?.trim()
  const candidates =
    configured
      ?.split(',')
      .map(value => value.trim())
      .filter(Boolean) ?? []

  return [...new Set([...candidates, ...DEFAULT_EVENT_TOOL_SLUGS])]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function getString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function extractEvents(payload: unknown): Record<string, unknown>[] {
  if (!isRecord(payload)) return []

  const candidates = [
    payload.events,
    payload.items,
    payload.data,
    isRecord(payload.data) ? payload.data.events : undefined,
    isRecord(payload.data) ? payload.data.items : undefined,
    isRecord(payload.result) ? payload.result.events : undefined,
    isRecord(payload.result) ? payload.result.items : undefined
  ]

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter(isRecord)
    }
  }

  return []
}

function readEventDate(value: unknown) {
  if (!isRecord(value)) return ''
  return getString(value.dateTime) || getString(value.date)
}

function toBrokCalendarEvent(
  event: Record<string, unknown>
): BrokCalendarEvent | null {
  const id =
    getString(event.id) || getString(event.eventId) || getString(event.event_id)
  if (!id) return null

  const startAt =
    readEventDate(event.start) ||
    getString(event.startAt) ||
    getString(event.start_time) ||
    getString(event.start)
  const endAt =
    readEventDate(event.end) ||
    getString(event.endAt) ||
    getString(event.end_time) ||
    getString(event.end)

  if (!startAt) return null

  return {
    id,
    summary:
      getString(event.summary) ||
      getString(event.title) ||
      getString(event.name) ||
      '(untitled event)',
    description: getString(event.description),
    location: getString(event.location),
    startAt,
    endAt,
    isAllDay:
      isRecord(event.start) &&
      typeof event.start.date === 'string' &&
      !event.start.dateTime,
    htmlLink: getString(event.htmlLink) || getString(event.html_link)
  }
}

export async function GET() {
  if (!isComposioConfigured()) {
    return NextResponse.json(
      { error: 'Composio is not configured for Google Calendar.' },
      { status: 503 }
    )
  }

  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(
      { error: 'Sign in to Brok before loading Calendar events.' },
      { status: 401 }
    )
  }

  const accountsByToolkit = await Promise.all(
    resolveCalendarToolkits().map(async toolkit => {
      const accounts = await listConnectedAccounts(user.id, toolkit, 10)
      return { toolkit, accounts }
    })
  )

  const account = accountsByToolkit
    .flatMap(result => result.accounts)
    .find(connectedAccount => {
      const status = connectedAccount.status?.toLowerCase()
      return !status || ['active', 'connected', 'enabled'].includes(status)
    })

  if (!account) {
    return NextResponse.json(
      {
        error: 'Connect Google Calendar through Composio before loading events.'
      },
      { status: 409 }
    )
  }

  const timeMin = new Date().toISOString()
  const timeMax = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  const errors: string[] = []

  for (const toolSlug of resolveEventToolSlugs()) {
    try {
      const payload = await executeComposioTool({
        toolSlug,
        userId: user.id,
        connectedAccountId: account.id,
        arguments: {
          calendar_id: 'primary',
          max_results: 25,
          single_events: true,
          order_by: 'startTime',
          time_min: timeMin,
          time_max: timeMax
        }
      })
      const events = extractEvents(payload)
        .map(toBrokCalendarEvent)
        .filter((event): event is BrokCalendarEvent => Boolean(event))

      return NextResponse.json({
        provider: 'composio',
        connectedAccountId: account.id,
        toolSlug,
        events
      })
    } catch (error) {
      errors.push(
        `${toolSlug}: ${error instanceof Error ? error.message : 'unknown error'}`
      )
    }
  }

  return NextResponse.json(
    {
      error:
        errors.at(-1) ??
        'Composio Google Calendar tools did not return events for this account.'
    },
    { status: 502 }
  )
}
