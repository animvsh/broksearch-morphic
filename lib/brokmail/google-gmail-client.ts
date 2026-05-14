import { MailThread } from './data'

export const GMAIL_SUPER_OAUTH_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events'
].join(' ')

type GmailHeader = {
  name?: string
  value?: string
}

type GmailMessagePart = {
  mimeType?: string
  body?: {
    data?: string
  }
  parts?: GmailMessagePart[]
}

type GmailMessage = {
  id: string
  threadId: string
  labelIds?: string[]
  snippet?: string
  internalDate?: string
  payload?: GmailMessagePart & {
    headers?: GmailHeader[]
  }
}

type GmailThread = {
  id: string
  messages?: GmailMessage[]
}

function gmailFetch<T>(accessToken: string, path: string, init?: RequestInit) {
  return fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    }
  }).then(async response => {
    const body = await response.json().catch(() => null)
    if (!response.ok) {
      const message =
        body?.error?.message || `Gmail request failed with ${response.status}`
      throw new Error(message)
    }
    return body as T
  })
}

function getHeader(message: GmailMessage, name: string) {
  const headers = message.payload?.headers ?? []
  return (
    headers.find(header => header.name?.toLowerCase() === name.toLowerCase())
      ?.value ?? ''
  )
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

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const binary = window.atob(padded)
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function findTextPart(part?: GmailMessagePart): string {
  if (!part) return ''

  if (part.mimeType === 'text/plain' && part.body?.data) {
    return decodeBase64Url(part.body.data)
  }

  for (const child of part.parts ?? []) {
    const result = findTextPart(child)
    if (result) return result
  }

  if (part.body?.data) {
    return decodeBase64Url(part.body.data)
  }

  return ''
}

function formatReceivedAt(message: GmailMessage) {
  const dateHeader = getHeader(message, 'Date')
  const date = dateHeader
    ? new Date(dateHeader)
    : message.internalDate
      ? new Date(Number(message.internalDate))
      : null

  if (!date || Number.isNaN(date.getTime())) return 'Recent'

  const today = new Date()
  const sameDay = date.toDateString() === today.toDateString()
  return sameDay
    ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function inferCategory(message: GmailMessage): MailThread['category'] {
  const from = getHeader(message, 'From').toLowerCase()
  const subject = getHeader(message, 'Subject').toLowerCase()
  const labels = message.labelIds ?? []

  if (/receipt|invoice|billing|stripe|railway/.test(`${from} ${subject}`)) {
    return 'receipt'
  }
  if (
    labels.includes('CATEGORY_PROMOTIONS') ||
    /newsletter|digest|updates|promo/.test(`${from} ${subject}`)
  ) {
    return 'newsletter'
  }
  if (/pricing|sales|pilot|customer|demo/.test(`${from} ${subject}`)) {
    return 'sales'
  }
  if (/university|professor|school|project|class/.test(`${from} ${subject}`)) {
    return 'school'
  }

  return 'primary'
}

function hasAttachment(message: GmailMessage) {
  const stack = [message.payload]
  while (stack.length) {
    const part = stack.pop()
    if (!part) continue
    if (
      part.body &&
      'attachmentId' in part.body &&
      typeof part.body.attachmentId === 'string'
    ) {
      return true
    }
    stack.push(...(part.parts ?? []))
  }
  return false
}

function toMailThread(gmailThread: GmailThread): MailThread | null {
  const messages = gmailThread.messages ?? []
  const firstMessage = messages[0]
  const lastMessage = messages[messages.length - 1]
  if (!firstMessage || !lastMessage) return null

  const sender = parseSender(getHeader(lastMessage, 'From'))
  const subject = getHeader(lastMessage, 'Subject') || '(no subject)'
  const labels = new Set(lastMessage.labelIds ?? [])
  const textBody =
    findTextPart(lastMessage.payload) || lastMessage.snippet || ''
  const category = inferCategory(lastMessage)
  const unread = labels.has('UNREAD')
  const inInbox = labels.has('INBOX')
  const fromSelf = /(^|<)me(@|>)/i.test(getHeader(lastMessage, 'From'))
  const needsReply = inInbox && !fromSelf && category !== 'newsletter'
  const waitingOnReply = labels.has('SENT') && !inInbox

  return {
    id: gmailThread.id,
    providerThreadId: gmailThread.id,
    providerMessageIds: messages.map(message => message.id),
    sender: sender.name,
    senderEmail: sender.email,
    subject,
    snippet: lastMessage.snippet || textBody.slice(0, 180),
    aiSummary: needsReply
      ? 'Live Gmail thread likely needs a reply.'
      : waitingOnReply
        ? 'Live Gmail sent thread may need a follow-up.'
        : category === 'receipt'
          ? 'Live Gmail receipt. Safe to label as Expenses.'
          : category === 'newsletter'
            ? 'Live Gmail newsletter. Low priority.'
            : 'Live Gmail thread ready for summary or draft.',
    receivedAt: formatReceivedAt(lastMessage),
    labels: [
      ...(inInbox ? ['Inbox'] : []),
      ...(labels.has('SENT') ? ['Sent'] : []),
      ...(labels.has('STARRED') ? ['Starred'] : []),
      ...(labels.has('IMPORTANT') ? ['Important'] : []),
      category === 'receipt' ? 'Receipt' : '',
      category === 'newsletter' ? 'Newsletter' : ''
    ].filter(Boolean),
    unread,
    starred: labels.has('STARRED'),
    important: labels.has('IMPORTANT') || labels.has('CATEGORY_PRIMARY'),
    hasAttachments: messages.some(hasAttachment),
    needsReply,
    waitingOnReply,
    category,
    messages: messages.map(message => {
      const parsed = parseSender(getHeader(message, 'From'))
      return {
        id: message.id,
        from: parsed.name,
        to: [getHeader(message, 'To') || 'me'],
        sentAt: formatReceivedAt(message),
        body: findTextPart(message.payload) || message.snippet || ''
      }
    }),
    actionItems: needsReply
      ? ['Read the live thread and draft a reply for approval']
      : waitingOnReply
        ? ['Consider sending a concise follow-up']
        : [],
    openQuestions: []
  }
}

export async function fetchGmailThreads(accessToken: string) {
  const list = await gmailFetch<{
    messages?: Array<{ id: string; threadId: string }>
  }>(accessToken, 'messages?maxResults=16&q=in:anywhere newer_than:90d')

  const threadIds = [
    ...new Set((list.messages ?? []).map(message => message.threadId))
  ].slice(0, 12)

  const threads = await Promise.all(
    threadIds.map(threadId =>
      gmailFetch<GmailThread>(
        accessToken,
        `threads/${threadId}?format=full`
      ).catch(() => null)
    )
  )

  return threads
    .map(thread => (thread ? toMailThread(thread) : null))
    .filter((thread): thread is MailThread => Boolean(thread))
}

function encodeRawEmail(value: string) {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return window
    .btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

export async function createGmailDraft({
  accessToken,
  thread,
  body
}: {
  accessToken: string
  thread: MailThread
  body: string
}) {
  const raw = encodeRawEmail(
    [
      `To: ${thread.senderEmail}`,
      `Subject: ${thread.subject.startsWith('Re:') ? thread.subject : `Re: ${thread.subject}`}`,
      'Content-Type: text/plain; charset="UTF-8"',
      '',
      body
    ].join('\r\n')
  )

  return gmailFetch<{ id: string }>(accessToken, 'drafts', {
    method: 'POST',
    body: JSON.stringify({
      message: {
        ...(thread.providerThreadId
          ? { threadId: thread.providerThreadId }
          : {}),
        raw
      }
    })
  })
}

export async function archiveGmailThread({
  accessToken,
  thread
}: {
  accessToken: string
  thread: MailThread
}) {
  const messageIds = thread.providerMessageIds ?? []
  await Promise.all(
    messageIds.map(messageId =>
      gmailFetch(accessToken, `messages/${messageId}/modify`, {
        method: 'POST',
        body: JSON.stringify({
          removeLabelIds: ['INBOX']
        })
      })
    )
  )
}
