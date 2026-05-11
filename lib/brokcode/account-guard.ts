import { NextResponse } from 'next/server'

import type { User } from '@supabase/supabase-js'

import { getCurrentUser } from '@/lib/auth/get-current-user'
import type { AuthResult } from '@/lib/brok/auth'

const LOCAL_FALLBACK_API_KEY_ID = '00000000-0000-0000-0000-000000000001'
const LOCAL_FALLBACK_WORKSPACE_ID = '00000000-0000-0000-0000-000000000000'

export async function getRequiredBrokAccountUser(): Promise<User | null> {
  return getCurrentUser()
}

export async function enforceBrokCodeAccountOwnership(
  authResult: Extract<AuthResult, { success: true }>
) {
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
