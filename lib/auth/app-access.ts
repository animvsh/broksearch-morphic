import { redirect } from 'next/navigation'

import type { User } from '@supabase/supabase-js'
import { eq } from 'drizzle-orm'

import { db } from '@/lib/db'
import { appAccessAllowlist } from '@/lib/db/schema'

import { getCurrentUser } from './get-current-user'

type AppAccessAllowed = {
  allowed: true
  user: User
  source: 'disabled' | 'admin' | 'env' | 'metadata' | 'database' | 'dev'
}

type AppAccessDenied = {
  allowed: false
  user: User | null
  reason: 'unauthenticated' | 'not_allowed' | 'allowlist_unavailable'
}

export type AppAccessResult = AppAccessAllowed | AppAccessDenied

function parseEmailList(value: string | undefined) {
  return (value ?? '').split(',').map(normalizeAccessEmail).filter(Boolean)
}

export function normalizeAccessEmail(email: string | null | undefined) {
  return (email ?? '').trim().toLowerCase()
}

export function isAppAccessGateEnabled() {
  return (
    process.env.APP_ACCESS_GATE === 'true' ||
    process.env.BROK_CLOUD_DEPLOYMENT === 'true'
  )
}

function envAllowedEmails() {
  return new Set([
    ...parseEmailList(process.env.APP_ALLOWED_EMAILS),
    ...parseEmailList(process.env.ALLOWED_EMAILS),
    ...parseEmailList(process.env.ADMIN_EMAILS)
  ])
}

function envAdminEmails() {
  return new Set(parseEmailList(process.env.ADMIN_EMAILS))
}

function hasMetadataAccess(user: User) {
  const metadata = user.app_metadata as Record<string, unknown> | null
  return metadata?.brok_access === true || metadata?.brokAccess === true
}

function canFailOpenForLocalDev(error: unknown) {
  if (process.env.NODE_ENV === 'production') {
    return false
  }

  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error)
  return [
    'relation "app_access_allowlist" does not exist',
    'app_access_allowlist',
    'failed query',
    'econnrefused',
    'enotfound',
    'getaddrinfo'
  ].some(fragment => message.includes(fragment))
}

export async function getAppAccessForUser(
  user: User | null
): Promise<AppAccessResult> {
  if (!user) {
    return { allowed: false, user: null, reason: 'unauthenticated' }
  }

  if (!isAppAccessGateEnabled()) {
    return { allowed: true, user, source: 'disabled' }
  }

  const email = normalizeAccessEmail(user.email)

  if (email && envAdminEmails().has(email)) {
    return { allowed: true, user, source: 'admin' }
  }

  if (email && envAllowedEmails().has(email)) {
    return { allowed: true, user, source: 'env' }
  }

  if (hasMetadataAccess(user)) {
    return { allowed: true, user, source: 'metadata' }
  }

  if (!email) {
    return { allowed: false, user, reason: 'not_allowed' }
  }

  try {
    const [allowlisted] = await db
      .select({
        id: appAccessAllowlist.id,
        status: appAccessAllowlist.status
      })
      .from(appAccessAllowlist)
      .where(eq(appAccessAllowlist.email, email))
      .limit(1)

    if (allowlisted?.status === 'active') {
      return { allowed: true, user, source: 'database' }
    }
  } catch (error) {
    if (canFailOpenForLocalDev(error)) {
      return { allowed: true, user, source: 'dev' }
    }

    return { allowed: false, user, reason: 'allowlist_unavailable' }
  }

  return { allowed: false, user, reason: 'not_allowed' }
}

export async function getCurrentAppAccess() {
  return getAppAccessForUser(await getCurrentUser())
}

export async function requireAppAccess(redirectTo: string) {
  const access = await getCurrentAppAccess()

  if (!access.user) {
    redirect(`/auth/login?redirectTo=${encodeURIComponent(redirectTo)}`)
  }

  if (!access.allowed) {
    redirect('/auth/access-pending')
  }

  return access.user
}

export async function requireAppAccessForApi() {
  const access = await getCurrentAppAccess()

  if (!access.user) {
    return {
      ok: false as const,
      response: Response.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }
  }

  if (!access.allowed) {
    return {
      ok: false as const,
      response: Response.json({ error: 'Access pending' }, { status: 403 })
    }
  }

  return { ok: true as const, user: access.user }
}
