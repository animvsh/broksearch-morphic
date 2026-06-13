import { NextResponse } from 'next/server'

import type { apiKeys, workspaces } from '@/lib/db/schema'

export type AuthResult =
  | {
      success: true
      apiKey: typeof apiKeys.$inferSelect
      workspace: typeof workspaces.$inferSelect
    }
  | {
      success: false
      error:
        | 'missing_authorization'
        | 'invalid_authorization_format'
        | 'invalid_api_key'
        | 'inactive_key'
        | 'workspace_inactive'
        | 'auth_storage_unavailable'
      status: number
    }

export function apiKeyHasScope(
  apiKey: typeof apiKeys.$inferSelect,
  requiredScope: string
) {
  const scopes = Array.isArray(apiKey.scopes) ? apiKey.scopes : []
  return scopes.includes(requiredScope) || scopes.includes('*')
}

export function forbiddenScopeResponse(requiredScope: string) {
  return NextResponse.json(
    {
      error: {
        type: 'permission_error',
        code: 'missing_scope',
        message: `This API key requires the ${requiredScope} scope.`
      }
    },
    { status: 403 }
  )
}

async function getAuthDependencies() {
  const [
    { eq, inArray },
    { getKeyPrefix, hashApiKey, verifyApiKey },
    { db },
    { apiKeys, workspaces }
  ] = await Promise.all([
    import('drizzle-orm'),
    import('@/lib/api-key'),
    import('@/lib/db'),
    import('@/lib/db/schema')
  ])

  return {
    eq,
    inArray,
    getKeyPrefix,
    hashApiKey,
    verifyApiKey,
    db,
    apiKeys,
    workspaces
  }
}

export async function verifyRequestAuth(request: Request): Promise<AuthResult> {
  const authHeader = request.headers.get('authorization')
  const apiKeyHeader = request.headers.get('x-api-key')

  if (!authHeader && !apiKeyHeader) {
    return { success: false, error: 'missing_authorization', status: 401 }
  }

  if (!apiKeyHeader && authHeader && !authHeader.startsWith('Bearer ')) {
    return {
      success: false,
      error: 'invalid_authorization_format',
      status: 401
    }
  }

  const key = apiKeyHeader ?? authHeader?.slice(7)

  if (!key) {
    return {
      success: false,
      error: 'invalid_authorization_format',
      status: 401
    }
  }

  const fallbackAuth = await createLocalFallbackAuth(key)

  let keyRecord: typeof apiKeys.$inferSelect | undefined

  try {
    const { eq, inArray, getKeyPrefix, hashApiKey, verifyApiKey, db, apiKeys } =
      await getAuthDependencies()
    // Two-stage lookup:
    //   1. Exact hash lookup for legacy global-salt keys.
    //   2. Prefix-indexed candidate lookup for per-key salted keys. We cannot
    //      compute a salted hash until we read the row salt, so the visible key
    //      prefix must be selective enough to avoid scanning active keys.
    const legacyHash = hashApiKey(key, null)

    ;[keyRecord] = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.keyHash, legacyHash))
      .limit(1)

    if (!keyRecord) {
      // New keys store a 20-character prefix that includes random material.
      // Older rows may only have the static 12-character environment prefix,
      // so include it as a compatibility fallback without scanning every key.
      const lookupPrefixes = getApiKeyLookupPrefixes(key, getKeyPrefix)
      const candidates = await db
        .select()
        .from(apiKeys)
        .where(inArray(apiKeys.keyPrefix, lookupPrefixes))
        .limit(100)

      for (const candidate of candidates) {
        if (!candidate.keySalt) continue
        if (verifyApiKey(key, candidate.keyHash, candidate.keySalt)) {
          keyRecord = candidate
          break
        }
      }
    }
  } catch {
    if (fallbackAuth) {
      return fallbackAuth
    }
    return { success: false, error: 'auth_storage_unavailable', status: 503 }
  }

  if (!keyRecord) {
    if (fallbackAuth) {
      return fallbackAuth
    }
    return { success: false, error: 'invalid_api_key', status: 401 }
  }

  if (keyRecord.status !== 'active') {
    return { success: false, error: 'inactive_key', status: 403 }
  }

  let workspace: typeof workspaces.$inferSelect | undefined

  try {
    const { eq, db, workspaces } = await getAuthDependencies()
    ;[workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, keyRecord.workspaceId))
      .limit(1)
  } catch {
    if (fallbackAuth) {
      return fallbackAuth
    }
    return { success: false, error: 'auth_storage_unavailable', status: 503 }
  }

  if (!workspace || workspace.status !== 'active') {
    return { success: false, error: 'workspace_inactive', status: 403 }
  }

  await updateApiKeyLastUsedAt(keyRecord.id)

  return { success: true, apiKey: keyRecord, workspace }
}

function getApiKeyLookupPrefixes(
  key: string,
  getKeyPrefix: (key: string) => string
): string[] {
  const prefixes = new Set<string>([getKeyPrefix(key)])
  if (key.length >= 12) {
    prefixes.add(key.slice(0, 12))
  }
  return Array.from(prefixes)
}

// Throttle lastUsedAt writes to once per 5 minutes per key.
// The throttle is module-level, so it survives across requests within
// a single server process but resets when the process restarts.
const LAST_USED_THROTTLE_MS = 5 * 60 * 1000
const lastUsedWrites = new Map<string, number>()

async function updateApiKeyLastUsedAt(apiKeyId: string) {
  const now = Date.now()
  const lastWrite = lastUsedWrites.get(apiKeyId) ?? 0
  if (now - lastWrite < LAST_USED_THROTTLE_MS) {
    return
  }
  lastUsedWrites.set(apiKeyId, now)
  try {
    const { eq, db, apiKeys } = await getAuthDependencies()
    await db
      .update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, apiKeyId))
  } catch (error) {
    console.error('Failed to update API key last-used timestamp:', error)
  }
}

function canUseLocalAuthFallback() {
  if (process.env.BROK_DISABLE_LOCAL_AUTH_FALLBACK === 'true') {
    return false
  }

  if (process.env.BROK_ENABLE_LOCAL_AUTH_FALLBACK === 'true') {
    if (process.env.BROK_CLOUD_DEPLOYMENT === 'true') {
      return false
    }
    return true
  }

  return false
}

async function createLocalFallbackAuth(
  key: string
): Promise<AuthResult | null> {
  if (!canUseLocalAuthFallback()) {
    return null
  }

  const allowedFallbackKey = process.env.BROK_SMOKE_API_KEY
  if (!allowedFallbackKey) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        '[brok-auth] BROK_ENABLE_LOCAL_AUTH_FALLBACK=true but BROK_SMOKE_API_KEY is not set. Local fallback is disabled.'
      )
    }
    return null
  }
  if (key !== allowedFallbackKey) {
    return null
  }

  const { hashApiKey } = await import('@/lib/api-key')
  const now = new Date()
  const keyHash = hashApiKey(key)
  const keyPrefix = key.slice(0, 20)

  return {
    success: true,
    apiKey: {
      id: '00000000-0000-0000-0000-000000000001',
      workspaceId: '00000000-0000-0000-0000-000000000000',
      userId: process.env.ANONYMOUS_USER_ID || 'anonymous-user',
      name: 'Local fallback key',
      keyPrefix,
      keyHash,
      keySalt: null,
      environment: key.includes('_test_') ? 'test' : 'live',
      status: 'active',
      scopes: ['chat:write', 'search:write', 'usage:read'],
      allowedModels: [],
      rpmLimit: 60,
      dailyRequestLimit: 1000,
      monthlyBudgetCents: 0,
      lastUsedAt: now,
      createdAt: now,
      revokedAt: null
    },
    workspace: {
      id: '00000000-0000-0000-0000-000000000000',
      name: 'Local Personal Workspace',
      ownerUserId: process.env.ANONYMOUS_USER_ID || 'anonymous-user',
      plan: 'free',
      status: 'active',
      monthlyBudgetCents: 0,
      createdAt: now
    }
  }
}

export function unauthorizedResponse(
  error: Extract<AuthResult, { success: false }>
): NextResponse {
  const body = {
    error: {
      type: 'authentication_error',
      code: error.error,
      message: getErrorMessage(error.error)
    }
  }
  return NextResponse.json(body, { status: error.status })
}

function getErrorMessage(error: string): string {
  const messages: Record<string, string> = {
    missing_authorization:
      'Authorization Bearer token or x-api-key header is required.',
    invalid_authorization_format: 'Authorization header must be Bearer token.',
    invalid_api_key: 'Invalid API key.',
    inactive_key: 'API key is inactive.',
    workspace_inactive: 'Workspace is inactive.',
    auth_storage_unavailable:
      'API key storage is unavailable. Check the database connection and try again.'
  }
  return messages[error] || 'Authentication failed.'
}
