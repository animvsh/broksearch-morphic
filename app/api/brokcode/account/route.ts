import { NextRequest, NextResponse } from 'next/server'

import { unauthorizedResponse } from '@/lib/brok/auth'
import {
  enforceBrokCodeAccountOwnership,
  getRequiredBrokAccountUser,
  verifyBrokCodeRequestAuth
} from '@/lib/brokcode/account-guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const user = await getRequiredBrokAccountUser()
  if (!user) {
    return NextResponse.json(
      {
        error: {
          type: 'authentication_error',
          code: 'brok_login_required',
          message: 'Sign in to Brok before using BrokCode Cloud.'
        }
      },
      { status: 401 }
    )
  }

  const { authResult } = await verifyBrokCodeRequestAuth(request)
  if (!authResult.success) {
    return unauthorizedResponse(authResult)
  }

  const accountMismatch = await enforceBrokCodeAccountOwnership(authResult)
  if (accountMismatch) return accountMismatch

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email ?? null
    },
    workspace: {
      id: authResult.workspace.id,
      name: authResult.workspace.name,
      plan: authResult.workspace.plan
    },
    apiKey: {
      id: authResult.apiKey.id,
      name: authResult.apiKey.name,
      prefix: authResult.apiKey.keyPrefix,
      environment: authResult.apiKey.environment,
      scopes: authResult.apiKey.scopes,
      status: authResult.apiKey.status
    }
  })
}
