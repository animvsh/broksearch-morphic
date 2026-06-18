import { NextResponse } from 'next/server'

import type { User } from '@supabase/supabase-js'

import { getAppAccessForUser, hasFeatureAccess } from '@/lib/auth/app-access'
import {
  getCurrentUser,
  isAnonymousAuthMode
} from '@/lib/auth/get-current-user'
import {
  apiKeyHasScope,
  type AuthResult,
  forbiddenScopeResponse,
  verifyRequestAuth
} from '@/lib/brok/auth'
import type { apiKeys, workspaces } from '@/lib/db/schema'

const LOCAL_FALLBACK_API_KEY_ID = '00000000-0000-0000-0000-000000000001'
const LOCAL_FALLBACK_WORKSPACE_ID = '00000000-0000-0000-0000-000000000000'
const BROWSER_SESSION_API_KEY_ID = '00000000-0000-0000-0000-000000000002'
const LOCAL_BROWSER_SESSION_WORKSPACE_ID =
  '00000000-0000-0000-0000-000000000003'

export type BrokCodeAuthResult = Extract<AuthResult, { success: true }> & {
  isBrowserSession?: boolean
}

export async function getRequiredBrokAccountUser(): Promise<User | null> {
  return getCurrentUser()
}

function canUseLocalBrowserSessionFallback() {
  if (process.env.BROK_CLOUD_DEPLOYMENT === 'true') return false
  if (process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID) {
    return false
  }
  if (process.env.VERCEL || process.env.NEXT_PUBLIC_VERCEL_ENV) return false
  if (process.env.BROKCODE_ALLOW_LOCAL_BROWSER_SESSION_FALLBACK === 'true') {
    return true
  }
  if (isAnonymousAuthMode()) return true
  return process.env.NODE_ENV !== 'production'
}

function canUseLocalApiKeyFallbackForBrokCode() {
  if (process.env.BROKCODE_ALLOW_LOCAL_AUTH_FALLBACK === 'true') {
    return true
  }

  return process.env.BROK_ENABLE_LOCAL_AUTH_FALLBACK === 'true'
}

function createBrowserSessionAuth({
  user,
  workspace
}: {
  user: User
  workspace: typeof workspaces.$inferSelect
}): BrokCodeAuthResult {
  return {
    success: true,
    isBrowserSession: true,
    apiKey: {
      id: BROWSER_SESSION_API_KEY_ID,
      workspaceId: workspace.id,
      userId: user.id,
      name: 'BrokCode Browser Session',
      keyPrefix: 'browser_session',
      keyHash: 'browser_session',
      keySalt: null,
      environment: 'live',
      status: 'active',
      scopes: ['code:write', 'agents:write', 'usage:read'],
      allowedModels: [],
      rpmLimit: 60,
      dailyRequestLimit: 5000,
      monthlyBudgetCents: 0,
      lastUsedAt: null,
      expiresAt: null,
      createdAt: new Date(),
      revokedAt: null,
      rotatedFromKeyId: null,
      rotatedToKeyId: null,
      rotatedAt: null
    } satisfies typeof apiKeys.$inferSelect,
    workspace
  }
}

function createLocalBrowserSessionAuth(user: User): BrokCodeAuthResult {
  return createBrowserSessionAuth({
    user,
    workspace: {
      id: LOCAL_BROWSER_SESSION_WORKSPACE_ID,
      name: 'Local Browser Workspace',
      ownerUserId: user.id,
      plan: 'free',
      status: 'active',
      monthlyBudgetCents: 0,
      createdAt: new Date()
    } satisfies typeof workspaces.$inferSelect
  })
}

async function getWorkspaceDependencies() {
  const [{ asc, eq }, { db }, { workspaces }] = await Promise.all([
    import('drizzle-orm'),
    import('@/lib/db'),
    import('@/lib/db/schema')
  ])

  return { asc, eq, db, workspaces }
}

async function getRuntimeKeyDependencies() {
  const { decryptRuntimeKey, getLatestSavedBrokCodeRuntimeKeyForUser } =
    await import('@/lib/brokcode/key-vault')

  return { decryptRuntimeKey, getLatestSavedBrokCodeRuntimeKeyForUser }
}

export async function verifyBrokCodeRequestAuth(request: Request): Promise<{
  authResult: AuthResult
  authorization: string | null
  xApiKey: string | null
  apiKey: string | null
  usedSavedRuntimeKey: boolean
}> {
  let authorization = request.headers.get('authorization')
  const xApiKey = request.headers.get('x-api-key')
  const hasExplicitCredential = Boolean(authorization || xApiKey)
  let apiKey =
    xApiKey ??
    (authorization?.startsWith('Bearer ') ? authorization.slice(7) : null)
  let authRequest = request
  let usedSavedRuntimeKey = false

  if (!hasExplicitCredential) {
    const user = await getCurrentUser()
    if (user) {
      const { decryptRuntimeKey, getLatestSavedBrokCodeRuntimeKeyForUser } =
        await getRuntimeKeyDependencies()
      const savedKey = await getLatestSavedBrokCodeRuntimeKeyForUser(
        user.id
      ).catch(error => {
        console.error('BrokCode saved runtime key lookup failed:', error)
        return null
      })
      if (savedKey) {
        apiKey = decryptRuntimeKey(savedKey)
        authorization = `Bearer ${apiKey}`
        usedSavedRuntimeKey = true
        const headers = new Headers(request.headers)
        headers.set('authorization', authorization)
        authRequest = new Request(request.url, {
          method: request.method,
          headers
        })
      }
    }
  }

  return {
    authResult: await verifyRequestAuth(authRequest),
    authorization,
    xApiKey,
    apiKey,
    usedSavedRuntimeKey
  }
}

export async function resolveBrokCodeRequestAuth(
  request: Request,
  {
    allowBrowserSession = false
  }: {
    allowBrowserSession?: boolean
  } = {}
) {
  const hasExplicitCredential = Boolean(
    request.headers.get('authorization') || request.headers.get('x-api-key')
  )

  if (allowBrowserSession && !hasExplicitCredential) {
    const browserSessionAuth = await getBrokCodeBrowserSessionAuth()
    if (browserSessionAuth) {
      return {
        authResult: browserSessionAuth,
        authorization: null,
        xApiKey: null,
        apiKey: null,
        usedSavedRuntimeKey: false
      }
    }
  }

  const auth = await verifyBrokCodeRequestAuth(request)
  if (
    auth.authResult.success ||
    !allowBrowserSession ||
    auth.authorization ||
    auth.xApiKey ||
    auth.apiKey
  ) {
    return auth
  }

  const browserSessionAuth = await getBrokCodeBrowserSessionAuth()
  if (!browserSessionAuth) return auth

  return {
    ...auth,
    authResult: browserSessionAuth
  }
}

export async function getBrokCodeBrowserSessionAuth(): Promise<BrokCodeAuthResult | null> {
  const user = await getCurrentUser()
  if (!user) return null

  const access = await getAppAccessForUser(user)
  if (!hasFeatureAccess(access, 'brokcode')) return null

  if (
    process.env.BROKCODE_PROJECT_STORAGE === 'file' &&
    canUseLocalBrowserSessionFallback()
  ) {
    return createLocalBrowserSessionAuth(user)
  }

  try {
    const { asc, eq, db, workspaces } = await getWorkspaceDependencies()
    const [existingWorkspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.ownerUserId, user.id))
      .orderBy(asc(workspaces.createdAt))
      .limit(1)

    const workspace =
      existingWorkspace ??
      (
        await db
          .insert(workspaces)
          .values({
            name: 'Personal Workspace',
            ownerUserId: user.id
          })
          .returning()
      )[0]

    if (!workspace || workspace.status !== 'active') {
      return null
    }

    return createBrowserSessionAuth({ user, workspace })
  } catch (error) {
    console.error('BrokCode browser workspace lookup failed:', error)
    if (canUseLocalBrowserSessionFallback()) {
      return createLocalBrowserSessionAuth(user)
    }

    return null
  }
}

export async function enforceBrokCodeAccountOwnership(
  authResult: BrokCodeAuthResult
) {
  if (authResult.isBrowserSession) {
    return null
  }

  const isLocalFallbackKey =
    authResult.apiKey.id === LOCAL_FALLBACK_API_KEY_ID ||
    authResult.workspace.id === LOCAL_FALLBACK_WORKSPACE_ID

  if (isLocalFallbackKey && !canUseLocalApiKeyFallbackForBrokCode()) {
    return NextResponse.json(
      {
        error: {
          type: 'authentication_error',
          code: 'brokcode_real_account_required',
          message:
            'BrokCode requires a real Brok account API key. Create a Brok API key from your signed-in account and retry.'
        }
      },
      { status: 403 }
    )
  }

  if (!isLocalFallbackKey && !apiKeyHasScope(authResult.apiKey, 'code:write')) {
    return forbiddenScopeResponse('code:write')
  }

  const user = await getCurrentUser()

  // Terminal, CLI, and third-party agent tools authenticate with the Brok API
  // key alone. Browser Cloud calls include Supabase cookies, so when a user is
  // present the key must belong to that exact Brok account.
  if (!user) {
    return null
  }

  const access = await getAppAccessForUser(user)
  if (!hasFeatureAccess(access, 'brokcode')) {
    return NextResponse.json(
      {
        error: {
          type: 'permission_error',
          code: 'feature_access_denied',
          message: 'BrokCode access is not enabled for this account.'
        }
      },
      { status: 403 }
    )
  }

  if (authResult.apiKey.userId === user.id) {
    return null
  }

  return NextResponse.json(
    {
      error: {
        type: 'authentication_error',
        code: 'brok_account_mismatch',
        message:
          'This Brok API key does not belong to the signed-in Brok account.'
      }
    },
    { status: 403 }
  )
}
