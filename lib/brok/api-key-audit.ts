export const API_KEY_AUDIT_EVENT_TYPES = [
  'created',
  'secret_revealed_once',
  'secret_acknowledged',
  'paused',
  'resumed',
  'revoked',
  'rotated',
  'expiry_updated',
  'denied_expired_key_usage'
] as const

export type ApiKeyAuditEventType = (typeof API_KEY_AUDIT_EVENT_TYPES)[number]
export type ApiKeyAuditActorType = 'user' | 'admin' | 'system'

export interface ApiKeyAuditRequestContext {
  requestId?: string | null
  ipAddress?: string | null
  userAgent?: string | null
}

export interface ApiKeyAuditEventInput extends ApiKeyAuditRequestContext {
  workspaceId: string
  apiKeyId?: string | null
  actorUserId?: string | null
  actorType?: ApiKeyAuditActorType
  eventType: ApiKeyAuditEventType
  keyPrefix: string
  metadata?: Record<string, unknown> | null
}

const SENSITIVE_METADATA_KEYS = [
  'apiKey',
  'apikey',
  'authorization',
  'bearer',
  'encryptedKey',
  'key',
  'keyHash',
  'keySalt',
  'password',
  'rawKey',
  'secret',
  'token'
]

const API_KEY_VALUE_PATTERN = /brok_sk_(?:live|test)_[A-Za-z0-9_-]{8,}/g
const REDACTED = '[redacted]'

async function getApiKeyAuditDependencies() {
  const [{ db }, { apiKeyAuditEvents }] = await Promise.all([
    import('@/lib/db'),
    import('@/lib/db/schema')
  ])

  return { db, apiKeyAuditEvents }
}

function isSensitiveMetadataKey(key: string) {
  const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase()
  return SENSITIVE_METADATA_KEYS.some(sensitiveKey =>
    normalized.includes(sensitiveKey.toLowerCase())
  )
}

function sanitizeMetadataValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value
  }

  if (typeof value === 'string') {
    return value.replace(API_KEY_VALUE_PATTERN, REDACTED)
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (Array.isArray(value)) {
    return value.map(item => sanitizeMetadataValue(item))
  }

  if (typeof value === 'object') {
    return sanitizeApiKeyAuditMetadata(value as Record<string, unknown>)
  }

  return String(value)
}

export function sanitizeApiKeyAuditMetadata(
  metadata: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (!metadata) {
    return null
  }

  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      key,
      isSensitiveMetadataKey(key) ? REDACTED : sanitizeMetadataValue(value)
    ])
  )
}

export function buildApiKeyAuditEventValues(input: ApiKeyAuditEventInput) {
  return {
    workspaceId: input.workspaceId,
    apiKeyId: input.apiKeyId ?? null,
    actorUserId: input.actorUserId ?? null,
    actorType: input.actorType ?? 'user',
    eventType: input.eventType,
    keyPrefix: input.keyPrefix,
    requestId: input.requestId ?? null,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    metadata: sanitizeApiKeyAuditMetadata(input.metadata),
    createdAt: new Date()
  }
}

export async function recordApiKeyAuditEvent(input: ApiKeyAuditEventInput) {
  const { db, apiKeyAuditEvents } = await getApiKeyAuditDependencies()
  const [event] = await db
    .insert(apiKeyAuditEvents)
    .values(buildApiKeyAuditEventValues(input))
    .returning()

  return event
}

export async function recordApiKeyAuditEvents(inputs: ApiKeyAuditEventInput[]) {
  if (inputs.length === 0) {
    return []
  }

  const { db, apiKeyAuditEvents } = await getApiKeyAuditDependencies()
  return db
    .insert(apiKeyAuditEvents)
    .values(inputs.map(input => buildApiKeyAuditEventValues(input)))
    .returning()
}
