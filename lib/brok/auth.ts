import { NextResponse } from 'next/server'

import { eq } from 'drizzle-orm'

import { hashApiKey } from '@/lib/api-key'
import { db } from '@/lib/db'
import { apiKeys, workspaces } from '@/lib/db/schema'

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

export async function verifyRequestAuth(request: Request): Promise<AuthResult> {
  const authHeader = request.headers.get('authorization')
  const apiKeyHeader = request.headers.get('x-api-key')

  if (!authHeader && !apiKeyHeader) {
    return { success: false, error: 'missing_authorization', status: 401 }
  }

  const key = apiKeyHeader ?? authHeader?.slice(7)

  if (!key || (authHeader && !authHeader.startsWith('Bearer '))) {
    return {
      success: false,
      error: 'invalid_authorization_format',
      status: 401
    }
  }

  const fallbackAuth = createLocalFallbackAuth(key)

  const keyHash = hashApiKey(key)
  let keyRecord: typeof apiKeys.$inferSelect | undefined

  try {
    ;[keyRecord] = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.keyHash, keyHash))
      .limit(1)
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

  return { success: true, apiKey: keyRecord, workspace }
}

function canUseLocalAuthFallback() {
  if (process.env.BROK_DISABLE_LOCAL_AUTH_FALLBACK === 'true') {
    return false
  }

  if (process.env.BROK_ENABLE_LOCAL_AUTH_FALLBACK === 'true') {
    return true
  }

  if (process.env.BROK_CLOUD_DEPLOYMENT === 'true') {
    return false
  }

  if (process.env.NODE_ENV !== 'production') {
    return true
  }

  return process.env.ENABLE_AUTH !== 'true'
}

function createLocalFallbackAuth(key: string): AuthResult | null {
  if (!canUseLocalAuthFallback()) {
    return null
  }

  if (!key.startsWith('brok_sk_')) {
    return null
  }

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
      environment: key.includes('_test_') ? 'test' : 'live',
      status: 'active',
      scopes: ['chat:write', 'search:write', 'code:write', 'agents:write'],
      allowedModels: [],
      rpmLimit: 120,
      dailyRequestLimit: 10000,
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
