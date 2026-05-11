import { NextResponse } from 'next/server'

import type { User } from '@supabase/supabase-js'

import { getCurrentUser } from '@/lib/auth/get-current-user'
import type { AuthResult } from '@/lib/brok/auth'

export async function getRequiredBrokAccountUser(): Promise<User | null> {
  return getCurrentUser()
}

export async function enforceBrokCodeAccountOwnership(
  authResult: Extract<AuthResult, { success: true }>
) {
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
