import {
  decryptBrokCodeSecret,
  encryptBrokCodeSecret
} from '@/lib/brokcode/key-vault'

export type BrokCodeBackendProvider = 'none' | 'insforge'
export type InsForgeBackendMode = 'trial' | 'existing' | 'self_hosted'
export type BrokCodeBackendStatus =
  | 'not_configured'
  | 'provisioning'
  | 'ready'
  | 'error'
  | 'expired'

export type BrokCodeBackendHealthStatus =
  | 'unknown'
  | 'checking'
  | 'online'
  | 'offline'
  | 'auth_error'
  | 'not_found'
  | 'expired_or_limited'
  | 'error'

export type BrokCodeBackendCapabilities = {
  database: boolean
  auth: boolean
  storage: boolean
  functions: boolean
  realtime: boolean
}

export type InsForgeBackendMetadata = {
  provider: 'insforge'
  mode: InsForgeBackendMode
  status: BrokCodeBackendStatus
  projectUrl: string | null
  dashboardUrl: string | null
  claimUrl: string | null
  projectId: string | null
  appkey: string | null
  region: string | null
  trialExpiresAt: string | null
  capabilities: BrokCodeBackendCapabilities
  health: BrokCodeBackendHealthStatus
  lastHealthStatus: number | null
  lastHealthCheckedAt: string | null
  adminKeyConfigured: boolean
  encryptedAdminKey?: string
  error: string | null
}

export type BrokCodeBackendMetadata =
  | {
      provider: 'none'
      status: 'not_configured'
      capabilities: BrokCodeBackendCapabilities
      health: 'unknown'
      adminKeyConfigured: false
    }
  | InsForgeBackendMetadata

export type PublicBrokCodeBackendMetadata =
  | Omit<InsForgeBackendMetadata, 'encryptedAdminKey'>
  | {
      provider: 'none'
      status: 'not_configured'
      capabilities: BrokCodeBackendCapabilities
      health: 'unknown'
      adminKeyConfigured: false
    }

export type ConfigureInsForgeBackendInput = {
  mode?: unknown
  status?: unknown
  projectUrl?: unknown
  dashboardUrl?: unknown
  claimUrl?: unknown
  projectId?: unknown
  appkey?: unknown
  region?: unknown
  trialExpiresAt?: unknown
  capabilities?: unknown
  health?: unknown
  lastHealthStatus?: unknown
  lastHealthCheckedAt?: unknown
  adminKey?: unknown
  existingEncryptedAdminKey?: unknown
  error?: unknown
}

const DEFAULT_CAPABILITIES: BrokCodeBackendCapabilities = {
  database: true,
  auth: true,
  storage: true,
  functions: true,
  realtime: false
}

const EMPTY_CAPABILITIES: BrokCodeBackendCapabilities = {
  database: false,
  auth: false,
  storage: false,
  functions: false,
  realtime: false
}

const INSFORGE_MODES = new Set<InsForgeBackendMode>([
  'trial',
  'existing',
  'self_hosted'
])

const BACKEND_STATUSES = new Set<BrokCodeBackendStatus>([
  'not_configured',
  'provisioning',
  'ready',
  'error',
  'expired'
])

const HEALTH_STATUSES = new Set<BrokCodeBackendHealthStatus>([
  'unknown',
  'checking',
  'online',
  'offline',
  'auth_error',
  'not_found',
  'expired_or_limited',
  'error'
])

function stringOrNull(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function urlOrNull(value: unknown) {
  const url = stringOrNull(value)
  if (!url) return null

  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null
    }
    return parsed.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

function isoStringOrNull(value: unknown) {
  const text = stringOrNull(value)
  if (!text) return null

  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function statusFrom(value: unknown, fallback: BrokCodeBackendStatus) {
  return typeof value === 'string' && BACKEND_STATUSES.has(value as never)
    ? (value as BrokCodeBackendStatus)
    : fallback
}

function modeFrom(value: unknown) {
  return typeof value === 'string' && INSFORGE_MODES.has(value as never)
    ? (value as InsForgeBackendMode)
    : 'existing'
}

function healthFrom(value: unknown) {
  return typeof value === 'string' && HEALTH_STATUSES.has(value as never)
    ? (value as BrokCodeBackendHealthStatus)
    : 'unknown'
}

function capabilitiesFrom(value: unknown) {
  if (!value || typeof value !== 'object') return DEFAULT_CAPABILITIES
  const source = value as Record<string, unknown>
  return {
    database:
      typeof source.database === 'boolean'
        ? source.database
        : DEFAULT_CAPABILITIES.database,
    auth:
      typeof source.auth === 'boolean'
        ? source.auth
        : DEFAULT_CAPABILITIES.auth,
    storage:
      typeof source.storage === 'boolean'
        ? source.storage
        : DEFAULT_CAPABILITIES.storage,
    functions:
      typeof source.functions === 'boolean'
        ? source.functions
        : DEFAULT_CAPABILITIES.functions,
    realtime:
      typeof source.realtime === 'boolean'
        ? source.realtime
        : DEFAULT_CAPABILITIES.realtime
  }
}

function numberOrNull(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function emptyBrokCodeBackendMetadata(): BrokCodeBackendMetadata {
  return {
    provider: 'none',
    status: 'not_configured',
    capabilities: EMPTY_CAPABILITIES,
    health: 'unknown',
    adminKeyConfigured: false
  }
}

export function createInsForgeBackendMetadata(
  input: ConfigureInsForgeBackendInput
): InsForgeBackendMetadata {
  const adminKey = stringOrNull(input.adminKey)
  const existingEncryptedAdminKey = stringOrNull(
    input.existingEncryptedAdminKey
  )
  const encryptedAdminKey = adminKey
    ? encryptBrokCodeSecret(adminKey)
    : existingEncryptedAdminKey
      ? existingEncryptedAdminKey
      : undefined
  const projectUrl = urlOrNull(input.projectUrl)
  const status =
    statusFrom(input.status, projectUrl ? 'ready' : 'provisioning') ??
    'provisioning'

  return {
    provider: 'insforge',
    mode: modeFrom(input.mode),
    status,
    projectUrl,
    dashboardUrl: urlOrNull(input.dashboardUrl),
    claimUrl: urlOrNull(input.claimUrl),
    projectId: stringOrNull(input.projectId),
    appkey: stringOrNull(input.appkey),
    region: stringOrNull(input.region),
    trialExpiresAt: isoStringOrNull(input.trialExpiresAt),
    capabilities: capabilitiesFrom(input.capabilities),
    health: healthFrom(input.health),
    lastHealthStatus: numberOrNull(input.lastHealthStatus),
    lastHealthCheckedAt: isoStringOrNull(input.lastHealthCheckedAt),
    adminKeyConfigured: Boolean(encryptedAdminKey),
    encryptedAdminKey,
    error: stringOrNull(input.error)
  }
}

export function normalizeBrokCodeBackendMetadata(
  value: unknown
): BrokCodeBackendMetadata {
  if (!value || typeof value !== 'object') {
    return emptyBrokCodeBackendMetadata()
  }

  const metadata = value as Record<string, unknown>
  if (metadata.provider !== 'insforge') {
    return emptyBrokCodeBackendMetadata()
  }

  return createInsForgeBackendMetadata({
    mode: metadata.mode,
    status: metadata.status,
    projectUrl: metadata.projectUrl,
    dashboardUrl: metadata.dashboardUrl,
    claimUrl: metadata.claimUrl,
    projectId: metadata.projectId,
    appkey: metadata.appkey,
    region: metadata.region,
    trialExpiresAt: metadata.trialExpiresAt,
    capabilities: metadata.capabilities,
    health: metadata.health,
    lastHealthStatus: metadata.lastHealthStatus,
    lastHealthCheckedAt: metadata.lastHealthCheckedAt,
    existingEncryptedAdminKey: metadata.encryptedAdminKey,
    error: metadata.error
  })
}

export function publicBrokCodeBackendMetadata(
  value: unknown
): PublicBrokCodeBackendMetadata {
  const metadata = normalizeBrokCodeBackendMetadata(value)
  if (metadata.provider === 'none') return metadata

  const { encryptedAdminKey: _encryptedAdminKey, ...publicMetadata } = metadata
  return publicMetadata
}

export function mergeBrokCodeProjectBackendMetadata({
  metadata,
  backend
}: {
  metadata: Record<string, unknown> | null | undefined
  backend: BrokCodeBackendMetadata
}) {
  return {
    ...(metadata ?? {}),
    backend
  }
}

export function decryptInsForgeAdminKey(
  backend: BrokCodeBackendMetadata
): string | null {
  if (backend.provider !== 'insforge' || !backend.encryptedAdminKey) {
    return null
  }

  return decryptBrokCodeSecret(backend.encryptedAdminKey)
}
