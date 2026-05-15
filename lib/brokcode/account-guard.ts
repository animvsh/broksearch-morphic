import { NextResponse } from 'next/server'

import type { User } from '@supabase/supabase-js'
import { asc, eq } from 'drizzle-orm'

import { getCurrentUser } from '@/lib/auth/get-current-user'
import { type AuthResult, verifyRequestAuth } from '@/lib/brok/auth'
import {
  decryptRuntimeKey,
  getLatestSavedBrokCodeRuntimeKeyForUser
} from '@/lib/brokcode/key-vault'
import { db } from '@/lib/db'
import { apiKeys, workspaces } from '@/lib/db/schema'

const LOCAL_FALLBACK_API_KEY_ID = '00000000-0000-0000-0000-000000000001'
const LOCAL_FALLBACK_WORKSPACE_ID = '00000000-0000-0000-0000-000000000000'
const BROWSER_SESSION_API_KEY_ID = '00000000-0000-0000-0000-000000000002'

export type BrokCodeAuthResult = Extract<AuthResult, { success: true }> & {
  isBrowserSession?: boolean
}

export async function getRequiredBrokAccountUser(): Promise<User | null> {
  return getCurrentUser()
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
      const savedKey = await getLatestSavedBrokCodeRuntimeKeyForUser(user.id)
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
      environment: 'live',
      status: 'active',
      scopes: ['code:write', 'agents:write', 'usage:read'],
      allowedModels: [],
      rpmLimit: 60,
      dailyRequestLimit: 5000,
      monthlyBudgetCents: 0,
      lastUsedAt: null,
      createdAt: new Date(),
      revokedAt: null
    } satisfies typeof apiKeys.$inferSelect,
    workspace
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

  if (
    isLocalFallbackKey &&
    process.env.BROKCODE_ALLOW_LOCAL_AUTH_FALLBACK !== 'true'
  ) {
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

  const user = await getCurrentUser()

  // Terminal, CLI, and third-party agent tools authenticate with the Brok API
  // key alone. Browser Cloud calls include Supabase cookies, so when a user is
  // present the key must belong to that exact Brok account.
  if (!user) {
    return null
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
