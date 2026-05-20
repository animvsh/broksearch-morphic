import { createHash, createHmac, timingSafeEqual } from 'crypto'

export type BrokMailComposioAction =
  | 'create_draft'
  | 'archive_threads'
  | 'create_calendar_event'
  | 'delete_calendar_event'

export type BrokMailApprovalThread = {
  id?: string
  providerThreadId?: string
  providerMessageIds?: string[]
  senderEmail?: string
  subject?: string
}

export type BrokMailApprovalCalendarEvent = {
  id?: string
  summary?: string
  startAt?: string
  endAt?: string
}

export type BrokMailActionApprovalPayload = {
  action: BrokMailComposioAction
  threads: BrokMailApprovalThread[]
  draftBody?: string
  calendarEvent?: BrokMailApprovalCalendarEvent | null
}

export type BrokMailSignedApproval = {
  id: string
  action: BrokMailComposioAction
  approved: true
  issuedAt: string
  expiresAt: string
  payloadHash: string
  signature: string
}

const APPROVAL_TTL_MS = 5 * 60 * 1000
const PROVIDER_ID_PATTERN = /^[A-Za-z0-9._:@/-]{1,256}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

export function normalizeAction(value: unknown): BrokMailComposioAction | null {
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

export function normalizeThreads(value: unknown): BrokMailApprovalThread[] {
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

export function normalizeCalendarEvent(
  value: unknown
): BrokMailApprovalCalendarEvent | null {
  if (!isRecord(value)) return null
  return {
    id: typeof value.id === 'string' ? value.id : undefined,
    summary: typeof value.summary === 'string' ? value.summary : undefined,
    startAt: typeof value.startAt === 'string' ? value.startAt : undefined,
    endAt: typeof value.endAt === 'string' ? value.endAt : undefined
  }
}

export function normalizeActionApprovalPayload(
  body: Record<string, unknown>
): BrokMailActionApprovalPayload | null {
  const action = normalizeAction(body.action)
  if (!action) return null

  return {
    action,
    threads: normalizeThreads(body.threads),
    draftBody: typeof body.draftBody === 'string' ? body.draftBody : undefined,
    calendarEvent: normalizeCalendarEvent(body.calendarEvent)
  }
}

export function assertActionPayloadIsRunnable(
  payload: BrokMailActionApprovalPayload
) {
  if (payload.action === 'create_draft') {
    const thread = payload.threads[0]
    if (!thread || !payload.draftBody?.trim()) {
      throw new Error('A target thread and draft body are required.')
    }

    assertRunnableThread(thread)

    if (!thread.senderEmail || !EMAIL_PATTERN.test(thread.senderEmail)) {
      throw new Error('A valid recipient email is required for draft replies.')
    }
    return
  }

  if (payload.action === 'archive_threads') {
    if (payload.threads.length === 0) {
      throw new Error('At least one target thread is required.')
    }
    payload.threads.forEach(assertRunnableThread)
    return
  }

  if (payload.action === 'create_calendar_event') {
    if (
      !payload.calendarEvent?.summary ||
      !payload.calendarEvent.startAt ||
      !payload.calendarEvent.endAt
    ) {
      throw new Error('Calendar title, start time, and end time are required.')
    }
    assertCalendarTimeRange(
      payload.calendarEvent.startAt,
      payload.calendarEvent.endAt
    )
    return
  }

  if (!payload.calendarEvent?.id || !isProviderId(payload.calendarEvent.id)) {
    throw new Error('Calendar event id is required.')
  }
}

function assertRunnableThread(thread: BrokMailApprovalThread) {
  const hasThreadId =
    isProviderId(thread.providerThreadId) || isProviderId(thread.id)
  const hasMessageId = thread.providerMessageIds?.some(isProviderId) ?? false

  if (!hasThreadId && !hasMessageId) {
    throw new Error('A valid provider thread or message id is required.')
  }
}

function isProviderId(value: string | undefined) {
  return Boolean(value && PROVIDER_ID_PATTERN.test(value))
}

function assertCalendarTimeRange(startAt: string, endAt: string) {
  const start = Date.parse(startAt)
  const end = Date.parse(endAt)

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    throw new Error('Calendar start and end times must be valid ISO dates.')
  }

  if (end <= start) {
    throw new Error('Calendar end time must be after the start time.')
  }
}

export function hashActionPayload(payload: BrokMailActionApprovalPayload) {
  return createHash('sha256')
    .update(stableStringify(payload), 'utf8')
    .digest('hex')
}

export function signBrokMailApproval({
  userId,
  payload,
  now = new Date()
}: {
  userId: string
  payload: BrokMailActionApprovalPayload
  now?: Date
}): BrokMailSignedApproval {
  assertActionPayloadIsRunnable(payload)
  const payloadHash = hashActionPayload(payload)

  const approval: Omit<BrokMailSignedApproval, 'signature'> = {
    id: createApprovalId({
      action: payload.action,
      payloadHash,
      userId,
      now
    }),
    action: payload.action,
    approved: true,
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + APPROVAL_TTL_MS).toISOString(),
    payloadHash
  }

  return {
    ...approval,
    signature: signApprovalFields(userId, approval)
  }
}

function createApprovalId({
  action,
  payloadHash,
  userId,
  now
}: {
  action: BrokMailComposioAction
  payloadHash: string
  userId: string
  now: Date
}) {
  const approvalWindow = Math.floor(now.getTime() / APPROVAL_TTL_MS)
  const digest = createHash('sha256')
    .update(stableStringify({ action, approvalWindow, payloadHash, userId }))
    .digest('hex')
    .slice(0, 32)

  return `approval_${digest}`
}

export function verifyBrokMailApproval({
  userId,
  approval,
  payload,
  now = new Date()
}: {
  userId: string
  approval: unknown
  payload: BrokMailActionApprovalPayload
  now?: Date
}) {
  const normalized = normalizeSignedApproval(approval)
  if (!normalized) {
    return 'BrokMail requires a server-issued approval token before running this Google action.'
  }

  if (normalized.action !== payload.action) {
    return 'BrokMail approval token does not match the requested Google action.'
  }

  if (normalized.payloadHash !== hashActionPayload(payload)) {
    return 'BrokMail approval token does not match the requested action payload.'
  }

  if (new Date(normalized.expiresAt).getTime() <= now.getTime()) {
    return 'BrokMail approval token expired. Review and approve the action again.'
  }

  const expectedSignature = signApprovalFields(userId, {
    id: normalized.id,
    action: normalized.action,
    approved: true,
    issuedAt: normalized.issuedAt,
    expiresAt: normalized.expiresAt,
    payloadHash: normalized.payloadHash
  })

  if (!safeEqual(normalized.signature, expectedSignature)) {
    return 'BrokMail approval token signature is invalid.'
  }

  return null
}

export function normalizeSignedApproval(
  value: unknown
): BrokMailSignedApproval | null {
  if (!isRecord(value)) return null
  const action = normalizeAction(value.action)
  if (
    !action ||
    value.approved !== true ||
    typeof value.id !== 'string' ||
    typeof value.issuedAt !== 'string' ||
    typeof value.expiresAt !== 'string' ||
    typeof value.payloadHash !== 'string' ||
    typeof value.signature !== 'string'
  ) {
    return null
  }

  return {
    id: value.id,
    action,
    approved: true,
    issuedAt: value.issuedAt,
    expiresAt: value.expiresAt,
    payloadHash: value.payloadHash,
    signature: value.signature
  }
}

function signApprovalFields(
  userId: string,
  approval: Omit<BrokMailSignedApproval, 'signature'>
) {
  return createHmac('sha256', resolveApprovalSecret())
    .update(stableStringify({ userId, approval }), 'utf8')
    .digest('hex')
}

function resolveApprovalSecret() {
  const secret =
    process.env.BROKMAIL_APPROVAL_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.SUPABASE_JWT_SECRET ||
    process.env.COMPOSIO_API_KEY

  if (secret) return secret

  if (process.env.NODE_ENV === 'production') {
    throw new Error('BROKMAIL_APPROVAL_SECRET is required in production.')
  }

  return 'dev-brokmail-approval-secret'
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  )
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }

  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, entryValue]) =>
          `${JSON.stringify(key)}:${stableStringify(entryValue)}`
      )
      .join(',')}}`
  }

  return JSON.stringify(value)
}
