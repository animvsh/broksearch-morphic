import { NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/get-current-user'
import { MailThread } from '@/lib/brokmail/data'
import {
  executeComposioTool,
  isComposioConfigured,
  listConnectedAccounts
} from '@/lib/integrations/composio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const DEFAULT_GMAIL_TOOLKITS = ['gmail', 'googlesuper']
const DEFAULT_FETCH_TOOL_SLUGS = [
  'GMAIL_FETCH_EMAILS',
  'GMAIL_LIST_MESSAGES',
  'GMAIL_LIST_THREADS'
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

function resolveFetchToolSlugs() {
  const configured = process.env.COMPOSIO_GMAIL_FETCH_TOOL_SLUGS?.trim()
  const candidates =
    configured
      ?.split(',')
      .map(value => value.trim())
      .filter(Boolean) ?? []

  return [...new Set([...candidates, ...DEFAULT_FETCH_TOOL_SLUGS])]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function getString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function decodeBase64Url(value: string) {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
    return Buffer.from(padded, 'base64').toString('utf8')
  } catch {
    return ''
  }
}

function readHeader(message: Record<string, unknown>, name: string) {
  const headers = message.headers ?? (message.payload as any)?.headers
  if (Array.isArray(headers)) {
    const match = headers.find(header => {
      return (
        isRecord(header) &&
        getString(header.name).toLowerCase() === name.toLowerCase()
      )
    })
    if (isRecord(match)) return getString(match.value)
  }

  if (isRecord(headers)) {
    const direct = headers[name] ?? headers[name.toLowerCase()]
    return getString(direct)
  }

  return getString(message[name]) || getString(message[name.toLowerCase()])
}

function parseSender(from: string) {
  const match = from.match(/^(.*?)\s*<([^>]+)>$/)
  if (!match) {
    return {
      name: from || 'Unknown sender',
      email: from || 'unknown@example.com'
    }
  }

  return {
    name: match[1]?.replace(/^"|"$/g, '').trim() || match[2]!,
    email: match[2]!
  }
}

function readPartBody(part: unknown): string {
  if (!isRecord(part)) return ''

  const body = part.body
  if (isRecord(body) && typeof body.data === 'string') {
    return decodeBase64Url(body.data)
  }

  const parts = part.parts
  if (Array.isArray(parts)) {
    for (const child of parts) {
      const text = readPartBody(child)
      if (text) return text
    }
  }

  return ''
}

function readBody(message: Record<string, unknown>) {
  return (
    getString(message.body) ||
    getString(message.text) ||
    getString(message.plainText) ||
    getString(message.plain_text) ||
    readPartBody(message.payload) ||
    getString(message.snippet)
  )
}

function readLabels(message: Record<string, unknown>) {
  const raw = message.labelIds ?? message.label_ids ?? message.labels
  if (!Array.isArray(raw)) return []
  return raw.filter((label): label is string => typeof label === 'string')
}

function formatReceivedAt(message: Record<string, unknown>) {
  const raw =
    readHeader(message, 'Date') ||
    getString(message.internalDate) ||
    getString(message.internal_date) ||
    getString(message.date)
  const date = raw && /^\d+$/.test(raw) ? new Date(Number(raw)) : new Date(raw)
  if (!raw || Number.isNaN(date.getTime())) return 'Recent'

  const today = new Date()
  const sameDay = date.toDateString() === today.toDateString()
  return sameDay
    ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function inferCategory(
  message: Record<string, unknown>,
  labels: string[]
): MailThread['category'] {
  const text =
    `${readHeader(message, 'From')} ${readHeader(message, 'Subject')} ${getString(message.snippet)}`.toLowerCase()

  if (/receipt|invoice|billing|stripe|railway/.test(text)) return 'receipt'
  if (
    labels.includes('CATEGORY_PROMOTIONS') ||
    /newsletter|digest|updates|promo/.test(text)
  ) {
    return 'newsletter'
  }
  if (/pricing|sales|pilot|customer|demo/.test(text)) return 'sales'
  if (/university|professor|school|project|class/.test(text)) return 'school'
  return 'primary'
}

function hasAttachment(message: Record<string, unknown>) {
  if (message.hasAttachments === true || message.has_attachments === true) {
    return true
  }

  const stack = [message.payload]
  while (stack.length) {
    const part = stack.pop()
    if (!isRecord(part)) continue
    const body = part.body
    if (isRecord(body) && typeof body.attachmentId === 'string') return true
    const parts = part.parts
    if (Array.isArray(parts)) stack.push(...parts)
  }

  return false
}

function extractMessages(payload: unknown): Record<string, unknown>[] {
  if (!isRecord(payload)) return []

  const candidates = [
    payload.messages,
    payload.emails,
    payload.items,
    payload.data,
    isRecord(payload.data) ? payload.data.messages : undefined,
    isRecord(payload.data) ? payload.data.emails : undefined,
    isRecord(payload.result) ? payload.result.messages : undefined,
    isRecord(payload.result) ? payload.result.emails : undefined
  ]

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter(isRecord)
    }
  }

  return []
}

function toMailThread(message: Record<string, unknown>): MailThread {
  const labels = readLabels(message)
  const from = readHeader(message, 'From') || getString(message.from)
  const sender = parseSender(from)
  const subject =
    readHeader(message, 'Subject') ||
    getString(message.subject) ||
    '(no subject)'
  const body = readBody(message)
  const category = inferCategory(message, labels)
  const unread = labels.includes('UNREAD') || message.unread === true
  const inInbox =
    labels.includes('INBOX') || labels.includes('CATEGORY_PRIMARY')
  const fromSelf = /(^|<)me(@|>)/i.test(from)
  const needsReply = inInbox && !fromSelf && category !== 'newsletter'
  const waitingOnReply = labels.includes('SENT') && !inInbox
  const messageId =
    getString(message.id) ||
    getString(message.messageId) ||
    getString(message.message_id)
  const threadId =
    getString(message.threadId) || getString(message.thread_id) || messageId

  return {
    id: threadId || messageId || `composio_${Date.now()}`,
    providerThreadId: threadId,
    providerMessageIds: messageId ? [messageId] : [],
    sender: sender.name,
    senderEmail: sender.email,
    subject,
    snippet: getString(message.snippet) || body.slice(0, 180),
    aiSummary: needsReply
      ? 'Live Composio Gmail thread likely needs a reply.'
      : waitingOnReply
        ? 'Live Composio Gmail sent thread may need a follow-up.'
        : category === 'receipt'
          ? 'Live Composio Gmail receipt. Safe to label as Expenses.'
          : category === 'newsletter'
            ? 'Live Composio Gmail newsletter. Low priority.'
            : 'Live Composio Gmail thread ready for Pi summary or draft.',
    receivedAt: formatReceivedAt(message),
    labels,
    unread,
    starred: labels.includes('STARRED'),
    important:
      labels.includes('IMPORTANT') || labels.includes('CATEGORY_PRIMARY'),
    hasAttachments: hasAttachment(message),
    needsReply,
    waitingOnReply,
    category,
    messages: [
      {
        id: messageId || threadId || `message_${Date.now()}`,
        from: sender.name,
        to: [readHeader(message, 'To') || 'me'],
        sentAt: formatReceivedAt(message),
        body
      }
    ],
    actionItems: needsReply
      ? ['Read the live Composio Gmail thread and draft a reply for approval']
      : waitingOnReply
        ? ['Consider sending a concise follow-up']
        : [],
    openQuestions: []
  }
}

export async function GET() {
  if (!isComposioConfigured()) {
    return NextResponse.json(
      { error: 'Composio is not configured for Gmail.' },
      { status: 503 }
    )
  }

  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(
      { error: 'Sign in to Brok before loading Gmail threads.' },
      { status: 401 }
    )
  }

  const accountsByToolkit = await Promise.all(
    resolveGmailToolkits().map(async toolkit => {
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
      { error: 'Connect Gmail through Composio before loading threads.' },
      { status: 409 }
    )
  }

  const errors: string[] = []
  for (const toolSlug of resolveFetchToolSlugs()) {
    try {
      const payload = await executeComposioTool({
        toolSlug,
        userId: user.id,
        connectedAccountId: account.id,
        arguments: {
          user_id: 'me',
          max_results: 25,
          include_payload: true,
          include_spam_trash: false,
          verbose: true
        }
      })
      const messages = extractMessages(payload)
      return NextResponse.json({
        provider: 'composio',
        connectedAccountId: account.id,
        toolSlug,
        threads: messages.map(toMailThread)
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
        'Composio Gmail tools did not return messages for this account.'
    },
    { status: 502 }
  )
}
