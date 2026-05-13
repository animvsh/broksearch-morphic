import { NextRequest, NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/get-current-user'
import { unauthorizedResponse, verifyRequestAuth } from '@/lib/brok/auth'
import { enforceBrokCodeAccountOwnership } from '@/lib/brokcode/account-guard'
import {
  deleteBrokCodeRuntimeKey,
  getLatestSavedBrokCodeRuntimeKeyForUser,
  getSavedBrokCodeRuntimeKey,
  saveBrokCodeRuntimeKey,
  serializeRuntimeKey
} from '@/lib/brokcode/key-vault'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init)
  response.headers.set('Cache-Control', 'no-store')
  return response
}

function getRawBearerKey(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth?.startsWith('Bearer ')) return auth.slice(7).trim()
  return request.headers.get('x-api-key')?.trim() ?? ''
}

async function requireSignedInUser() {
  const user = await getCurrentUser()
  if (!user) {
    return {
      response: jsonNoStore(
        {
          error: {
            type: 'authentication_error',
            code: 'brok_login_required',
            message: 'Sign in to Brok before managing BrokCode keys.'
          }
        },
        { status: 401 }
      )
    }
  }

  return { user }
}

export async function GET(request: NextRequest) {
  const signedIn = await requireSignedInUser()
  if ('response' in signedIn) return signedIn.response

  const authResult = await verifyRequestAuth(request)
  if (!authResult.success) {
    if (authResult.error !== 'missing_authorization') {
      return unauthorizedResponse(authResult)
    }

    const row = await getLatestSavedBrokCodeRuntimeKeyForUser(signedIn.user.id)
    return jsonNoStore({
      key: row
        ? serializeRuntimeKey(row, {
            reveal: request.nextUrl.searchParams.get('reveal') === 'true'
          })
        : null
    })
  }

  const accountMismatch = await enforceBrokCodeAccountOwnership(authResult)
  if (accountMismatch) return accountMismatch

  const row = await getSavedBrokCodeRuntimeKey({
    workspaceId: authResult.workspace.id,
    userId: signedIn.user.id
  })

  return jsonNoStore({
    key: row
      ? serializeRuntimeKey(row, {
          reveal: request.nextUrl.searchParams.get('reveal') === 'true'
        })
      : null
  })
}

export async function PUT(request: NextRequest) {
  const signedIn = await requireSignedInUser()
  if ('response' in signedIn) return signedIn.response

  const rawKey = getRawBearerKey(request)
  const authResult = await verifyRequestAuth(request)
  if (!authResult.success) {
    return unauthorizedResponse(authResult)
  }

  const accountMismatch = await enforceBrokCodeAccountOwnership(authResult)
  if (accountMismatch) return accountMismatch

  const body = await request.json().catch(() => null)
  const defaultSessionId =
    typeof body?.defaultSessionId === 'string'
      ? body.defaultSessionId
      : typeof body?.session_id === 'string'
        ? body.session_id
        : 'default'

  const row = await saveBrokCodeRuntimeKey({
    apiKey: authResult.apiKey,
    workspaceId: authResult.workspace.id,
    userId: signedIn.user.id,
    rawKey,
    defaultSessionId
  })

  return jsonNoStore({ key: serializeRuntimeKey(row) })
}

export async function DELETE(request: NextRequest) {
  const signedIn = await requireSignedInUser()
  if ('response' in signedIn) return signedIn.response

  const authResult = await verifyRequestAuth(request)
  if (!authResult.success) {
    return unauthorizedResponse(authResult)
  }

  const accountMismatch = await enforceBrokCodeAccountOwnership(authResult)
  if (accountMismatch) return accountMismatch

  await deleteBrokCodeRuntimeKey({
    workspaceId: authResult.workspace.id,
    userId: signedIn.user.id
  })

  return jsonNoStore({ ok: true })
}
