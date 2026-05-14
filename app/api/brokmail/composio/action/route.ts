import { NextRequest, NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/get-current-user'
import {
  assertActionPayloadIsRunnable,
  BrokMailApprovalCalendarEvent,
  BrokMailApprovalThread,
  BrokMailComposioAction,
  isRecord,
  normalizeActionApprovalPayload,
  normalizeSignedApproval,
  verifyBrokMailApproval
} from '@/lib/brokmail/action-approval'
import { consumeBrokMailApproval } from '@/lib/brokmail/approval-consumption'
import {
  executeComposioTool,
  isComposioConfigured,
  listConnectedAccounts
} from '@/lib/integrations/composio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DEFAULT_GMAIL_TOOLKITS = ['gmail', 'googlesuper']
const CALENDAR_TOOLKITS = [
  'googlecalendar',
  'googlesuper',
  'google-calendar',
  'google_calendar',
  'gcal',
  'calendar'
]

function resolveGmailToolkits() {
  const configured = process.env.COMPOSIO_GMAIL_TOOLKIT_SLUGS?.trim()
  if (!configured) return DEFAULT_GMAIL_TOOLKITS

  const candidates = configured
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean)

  return candidates.length > 0 ? candidates : DEFAULT_GMAIL_TOOLKITS
}

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

async function findConnectedAccountId(
  userId: string,
  action: BrokMailComposioAction
) {
  const toolkits =
    action === 'create_calendar_event' || action === 'delete_calendar_event'
      ? CALENDAR_TOOLKITS
      : resolveGmailToolkits()

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
  threads: BrokMailApprovalThread[]
  draftBody?: string
  calendarEvent?: BrokMailApprovalCalendarEvent | null
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
          'Composio is not configured. BrokMail Google actions require Composio; platform Google OAuth is disabled.'
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

  const payload = normalizeActionApprovalPayload(body)
  if (!payload) {
    return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 })
  }

  try {
    assertActionPayloadIsRunnable(payload)
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'BrokMail action payload is invalid.'
      },
      { status: 400 }
    )
  }

  const approvalError = verifyBrokMailApproval({
    userId: user.id,
    approval: body.approval,
    payload
  })
  if (approvalError) {
    return NextResponse.json({ error: approvalError }, { status: 403 })
  }

  const approval = normalizeSignedApproval(body.approval)
  if (!approval) {
    return NextResponse.json(
      { error: 'BrokMail approval token is invalid.' },
      { status: 403 }
    )
  }

  try {
    const consumed = await consumeBrokMailApproval({
      userId: user.id,
      approval
    })

    if (!consumed) {
      return NextResponse.json(
        { error: 'BrokMail approval token has already been used.' },
        { status: 409 }
      )
    }
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Could not record BrokMail approval consumption.'
      },
      { status: 503 }
    )
  }

  const text = buildActionText({
    action: payload.action,
    threads: payload.threads,
    draftBody: payload.draftBody,
    calendarEvent: payload.calendarEvent
  })
  const connectedAccountId = await findConnectedAccountId(
    user.id,
    payload.action
  )

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

  for (const toolSlug of parseToolSlugs(payload.action)) {
    try {
      const result = await executeComposioTool({
        toolSlug,
        userId: user.id,
        connectedAccountId,
        text
      })

      return NextResponse.json({
        ok: true,
        action: payload.action,
        toolSlug,
        connectedAccountId,
        approval: {
          id: approval.id,
          action: approval.action,
          approved: true
        },
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
