import { NextRequest, NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/get-current-user'
import {
  executeComposioTool,
  isComposioConfigured,
  listConnectedAccounts
} from '@/lib/integrations/composio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type BrokMailComposioAction =
  | 'create_draft'
  | 'archive_threads'
  | 'create_calendar_event'
  | 'delete_calendar_event'

type BrokMailComposioThread = {
  id?: string
  providerThreadId?: string
  providerMessageIds?: string[]
  senderEmail?: string
  subject?: string
}

type BrokMailComposioCalendarEvent = {
  id?: string
  summary?: string
  startAt?: string
  endAt?: string
}

const GMAIL_TOOLKITS = ['googlesuper', 'gmail']
const CALENDAR_TOOLKITS = [
  'googlesuper',
  'googlecalendar',
  'google-calendar',
  'google_calendar',
  'gcal',
  'calendar'
]

const DEFAULT_TOOL_SLUGS: Record<BrokMailComposioAction, string[]> = {
  create_draft: ['GMAIL_CREATE_EMAIL_DRAFT', 'GMAIL_CREATE_DRAFT'],
  archive_threads: ['GMAIL_MODIFY_EMAIL_LABELS', 'GMAIL_MODIFY_THREAD_LABELS'],
  create_calendar_event: [
    'GOOGLECALENDAR_CREATE_EVENT',
    'GOOGLE_CALENDAR_CREATE_EVENT'
  ],
  delete_calendar_event: [
    'GOOGLECALENDAR_DELETE_EVENT',
    'GOOGLE_CALENDAR_DELETE_EVENT'
  ]
}

const ENV_TOOL_SLUGS: Record<BrokMailComposioAction, string[]> = {
  create_draft: [
    'COMPOSIO_BROKMAIL_DRAFT_TOOL_SLUGS',
    'COMPOSIO_GMAIL_DRAFT_TOOL_SLUGS',
    'COMPOSIO_GMAIL_CREATE_DRAFT_TOOL_SLUG'
  ],
  archive_threads: [
    'COMPOSIO_BROKMAIL_ARCHIVE_TOOL_SLUGS',
    'COMPOSIO_GMAIL_ARCHIVE_TOOL_SLUGS',
    'COMPOSIO_GMAIL_ARCHIVE_TOOL_SLUG'
  ],
  create_calendar_event: [
    'COMPOSIO_BROKMAIL_CALENDAR_CREATE_TOOL_SLUGS',
    'COMPOSIO_GCAL_CREATE_TOOL_SLUGS',
    'COMPOSIO_CALENDAR_CREATE_TOOL_SLUG'
  ],
  delete_calendar_event: [
    'COMPOSIO_BROKMAIL_CALENDAR_DELETE_TOOL_SLUGS',
    'COMPOSIO_GCAL_DELETE_TOOL_SLUGS',
    'COMPOSIO_CALENDAR_DELETE_TOOL_SLUG'
  ]
}

function parseToolSlugs(action: BrokMailComposioAction) {
  const configured = ENV_TOOL_SLUGS[action].flatMap(key =>
    (process.env[key] || '')
      .split(',')
      .map(value => value.trim())
      .filter(Boolean)
  )

  return [...new Set([...configured, ...DEFAULT_TOOL_SLUGS[action]])]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function normalizeAction(value: unknown): BrokMailComposioAction | null {
  if (
    value === 'create_draft' ||
    value === 'archive_threads' ||
    value === 'create_calendar_event' ||
    value === 'delete_calendar_event'
  ) {
    return value
  }

  return null
}

function normalizeThreads(value: unknown): BrokMailComposioThread[] {
  if (!Array.isArray(value)) return []
  return value.filter(isRecord).map(item => ({
    id: typeof item.id === 'string' ? item.id : undefined,
    providerThreadId:
      typeof item.providerThreadId === 'string'
        ? item.providerThreadId
        : undefined,
    providerMessageIds: Array.isArray(item.providerMessageIds)
      ? item.providerMessageIds.filter(
          (messageId): messageId is string => typeof messageId === 'string'
        )
      : undefined,
    senderEmail:
      typeof item.senderEmail === 'string' ? item.senderEmail : undefined,
    subject: typeof item.subject === 'string' ? item.subject : undefined
  }))
}

function normalizeCalendarEvent(
  value: unknown
): BrokMailComposioCalendarEvent | null {
  if (!isRecord(value)) return null
  return {
    id: typeof value.id === 'string' ? value.id : undefined,
    summary: typeof value.summary === 'string' ? value.summary : undefined,
    startAt: typeof value.startAt === 'string' ? value.startAt : undefined,
    endAt: typeof value.endAt === 'string' ? value.endAt : undefined
  }
}

async function findConnectedAccountId(
  userId: string,
  action: BrokMailComposioAction
) {
  const toolkits =
    action === 'create_calendar_event' || action === 'delete_calendar_event'
      ? CALENDAR_TOOLKITS
      : GMAIL_TOOLKITS

  const settled = await Promise.allSettled(
    toolkits.map(async toolkit => listConnectedAccounts(userId, toolkit, 10))
  )

  const accounts = settled.flatMap(result =>
    result.status === 'fulfilled' ? result.value : []
  )

  return accounts.find(account => {
    const status = account.status?.toLowerCase()
    return !status || ['active', 'connected', 'enabled'].includes(status)
  })?.id
}

function buildActionText({
  action,
  threads,
  draftBody,
  calendarEvent
}: {
  action: BrokMailComposioAction
  threads: BrokMailComposioThread[]
  draftBody?: string
  calendarEvent?: BrokMailComposioCalendarEvent | null
}) {
  if (action === 'create_draft') {
    const thread = threads[0]
    if (!thread || !draftBody?.trim()) {
      throw new Error('A target thread and draft body are required.')
    }

    return [
      'Create a Gmail draft only. Do not send the email.',
      `Thread id: ${thread.providerThreadId || thread.id || 'unknown'}.`,
      `Recipient: ${thread.senderEmail || 'the sender of the thread'}.`,
      `Subject: ${thread.subject || 'Re: selected thread'}.`,
      'Draft body:',
      draftBody.trim()
    ].join('\n')
  }

  if (action === 'archive_threads') {
    if (threads.length === 0) {
      throw new Error('At least one target thread is required.')
    }

    return [
      'Archive these Gmail threads by removing them from Inbox. Do not delete email.',
      ...threads.map(thread =>
        [
          `Thread: ${thread.providerThreadId || thread.id || 'unknown'}`,
          thread.providerMessageIds?.length
            ? `Messages: ${thread.providerMessageIds.join(', ')}`
            : null,
          thread.subject ? `Subject: ${thread.subject}` : null
        ]
          .filter(Boolean)
          .join(' | ')
      )
    ].join('\n')
  }

  if (action === 'create_calendar_event') {
    if (
      !calendarEvent?.summary ||
      !calendarEvent.startAt ||
      !calendarEvent.endAt
    ) {
      throw new Error('Calendar title, start time, and end time are required.')
    }

    return [
      'Create a Google Calendar event on the primary calendar.',
      `Title: ${calendarEvent.summary}.`,
      `Start: ${calendarEvent.startAt}.`,
      `End: ${calendarEvent.endAt}.`
    ].join('\n')
  }

  if (!calendarEvent?.id) {
    throw new Error('Calendar event id is required.')
  }

  return [
    'Delete this Google Calendar event from the primary calendar.',
    `Event id: ${calendarEvent.id}.`,
    calendarEvent.summary ? `Title: ${calendarEvent.summary}.` : null
  ]
    .filter(Boolean)
    .join('\n')
}

export async function POST(request: NextRequest) {
  if (!isComposioConfigured()) {
    return NextResponse.json(
      {
        error:
          'Composio is not configured. Connect Google in BrokMail or use live browser Google OAuth.'
      },
      { status: 503 }
    )
  }

  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(
      { error: 'Sign in to Brok before running Composio actions.' },
      { status: 401 }
    )
  }

  const body = await request.json().catch(() => null)
  if (!isRecord(body)) {
    return NextResponse.json(
      { error: 'Invalid request body.' },
      { status: 400 }
    )
  }

  const action = normalizeAction(body.action)
  if (!action) {
    return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 })
  }

  const threads = normalizeThreads(body.threads)
  const draftBody =
    typeof body.draftBody === 'string' ? body.draftBody : undefined
  const calendarEvent = normalizeCalendarEvent(body.calendarEvent)
  const text = buildActionText({ action, threads, draftBody, calendarEvent })
  const connectedAccountId = await findConnectedAccountId(user.id, action)

  if (!connectedAccountId) {
    return NextResponse.json(
      {
        error:
          'No connected Google account was found for this Brok user. Reconnect Gmail or Calendar from Integrations.'
      },
      { status: 409 }
    )
  }

  const attempted: Array<{ slug: string; error: string }> = []

  for (const toolSlug of parseToolSlugs(action)) {
    try {
      const result = await executeComposioTool({
        toolSlug,
        userId: user.id,
        connectedAccountId,
        text
      })

      return NextResponse.json({
        ok: true,
        action,
        toolSlug,
        connectedAccountId,
        result
      })
    } catch (error) {
      attempted.push({
        slug: toolSlug,
        error: error instanceof Error ? error.message : 'Composio tool failed.'
      })
    }
  }

  return NextResponse.json(
    {
      error:
        attempted[0]?.error ||
        'No configured Composio tool slug could run this action.',
      attempted
    },
    { status: 502 }
  )
}
