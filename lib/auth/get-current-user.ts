import type { User } from '@supabase/supabase-js'

import { createClient } from '@/lib/supabase/server'
import { perfLog } from '@/lib/utils/perf-logging'
import { incrementAuthCallCount } from '@/lib/utils/perf-tracking'

export function isAnonymousAuthMode() {
  return (
    process.env.ENABLE_AUTH === 'false' &&
    process.env.BROK_CLOUD_DEPLOYMENT !== 'true'
  )
}

function getAnonymousUser(): User {
  const id =
    process.env.ANONYMOUS_USER_ID || '00000000-0000-0000-0000-000000000000'
  const now = new Date(0).toISOString()

  return {
    id,
    app_metadata: { provider: 'anonymous', providers: ['anonymous'] },
    aud: 'authenticated',
    created_at: now,
    email: process.env.ANONYMOUS_USER_EMAIL || 'anonymous@local.brok',
    role: 'authenticated',
    updated_at: now,
    user_metadata: { name: 'Local Brok User' }
  } as User
}

export async function getCurrentUser() {
  if (isAnonymousAuthMode()) {
    return getAnonymousUser()
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return null // Supabase is not configured
  }

  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  return data.user ?? null
}

export async function getCurrentUserId() {
  const count = incrementAuthCallCount()
  perfLog(`getCurrentUserId called - count: ${count}`)
  const supabaseConfigured =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const authExplicitlyEnabled = process.env.ENABLE_AUTH === 'true'
  const cloudDeployment = process.env.BROK_CLOUD_DEPLOYMENT === 'true'
  const anonymousUserId =
    process.env.ANONYMOUS_USER_ID || '00000000-0000-0000-0000-000000000000'

  // Skip authentication mode (for personal Docker deployments)
  if (isAnonymousAuthMode()) {
    // Guard: Prevent disabling auth in Brok Cloud deployments
    if (cloudDeployment) {
      throw new Error(
        'ENABLE_AUTH=false is not allowed in BROK_CLOUD_DEPLOYMENT'
      )
    }

    // Always warn when authentication is disabled (except in tests)
    if (process.env.NODE_ENV !== 'test') {
      console.warn(
        '⚠️  Authentication disabled. Running in anonymous mode.\n' +
          '   All users share the same user ID. For personal use only.'
      )
    }

    return anonymousUserId
  }

  if (!authExplicitlyEnabled && !cloudDeployment) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(
        supabaseConfigured
          ? '⚠️  Auth is not explicitly enabled. Falling back to anonymous mode.'
          : '⚠️  Supabase auth is not configured. Falling back to anonymous mode.'
      )
    }

    return anonymousUserId
  }

  if (!supabaseConfigured && cloudDeployment) {
    throw new Error(
      'Supabase auth must be configured in BROK_CLOUD_DEPLOYMENT mode.'
    )
  }

  const user = await getCurrentUser()
  return user?.id
}
