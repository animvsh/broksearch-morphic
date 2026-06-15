'use server'

import { revalidatePath } from 'next/cache'

import { asc, desc, eq } from 'drizzle-orm'

import { requireAdminAccess } from '@/lib/auth/admin'
import { isAnonymousAuthMode } from '@/lib/auth/get-current-user'
import { db } from '@/lib/db'
import { appAccessAllowlist, appAccessRequests } from '@/lib/db/schema'

import {
  normalizeEmailForAllowlist,
  parseAllowlistFeatureGrant
} from './admin-access-utils'

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const errorWithCode = error as unknown as { code?: unknown }
    const code =
      typeof errorWithCode.code === 'string' ? errorWithCode.code : ''
    const cause =
      error.cause instanceof Error
        ? getErrorMessage(error.cause)
        : error.cause
          ? String(error.cause)
          : ''

    return [error.message, code, cause].filter(Boolean).join(' | ')
  }

  return String(error)
}

function canUseDevDbFallback(error: unknown): boolean {
  if (process.env.BROK_DEV_DB_FALLBACK === 'false') {
    return false
  }

  const message = getErrorMessage(error).toLowerCase()
  return [
    'enotfound',
    'ehostunreach',
    'econnrefused',
    'etimedout',
    'network',
    'connect econn',
    'getaddrinfo',
    'failed query',
    'connection terminated',
    'unable to connect'
  ].some(fragment => message.includes(fragment))
}

async function requireAdminActorId() {
  const access = await requireAdminAccess()

  if (!access.ok) {
    throw new Error(access.error)
  }

  return access.user?.id ?? 'admin'
}

async function assertAdminAccess() {
  await requireAdminActorId()
}

function revalidateAdminAccessPaths() {
  revalidatePath('/admin/access')
  revalidatePath('/admin/brok')
}

export async function getAppAccessAllowlist() {
  await assertAdminAccess()

  if (isAnonymousAuthMode()) {
    return []
  }

  try {
    return await db
      .select({
        id: appAccessAllowlist.id,
        email: appAccessAllowlist.email,
        status: appAccessAllowlist.status,
        features: appAccessAllowlist.features,
        note: appAccessAllowlist.note,
        createdBy: appAccessAllowlist.createdBy,
        createdAt: appAccessAllowlist.createdAt,
        updatedAt: appAccessAllowlist.updatedAt,
        revokedAt: appAccessAllowlist.revokedAt
      })
      .from(appAccessAllowlist)
      .orderBy(asc(appAccessAllowlist.email))
  } catch (error) {
    if (canUseDevDbFallback(error)) {
      return []
    }

    throw error
  }
}

export async function getAppAccessRequests() {
  await assertAdminAccess()

  if (isAnonymousAuthMode()) {
    return []
  }

  try {
    return await db
      .select({
        id: appAccessRequests.id,
        email: appAccessRequests.email,
        phoneNumber: appAccessRequests.phoneNumber,
        status: appAccessRequests.status,
        userId: appAccessRequests.userId,
        source: appAccessRequests.source,
        createdAt: appAccessRequests.createdAt,
        updatedAt: appAccessRequests.updatedAt,
        reviewedAt: appAccessRequests.reviewedAt,
        reviewedBy: appAccessRequests.reviewedBy
      })
      .from(appAccessRequests)
      .orderBy(desc(appAccessRequests.createdAt))
      .limit(50)
  } catch (error) {
    if (canUseDevDbFallback(error)) {
      return []
    }

    throw error
  }
}

export async function grantAppAccessByEmail(formData: FormData) {
  const actorId = await requireAdminActorId()
  const email = normalizeEmailForAllowlist(String(formData.get('email') ?? ''))
  const note = String(formData.get('note') ?? '').trim()
  const features = parseAllowlistFeatureGrant(formData)
  const requestId = String(formData.get('requestId') ?? '').trim()

  if (!email || !email.includes('@')) {
    throw new Error('A valid email is required')
  }

  await db
    .insert(appAccessAllowlist)
    .values({
      email,
      status: 'active',
      features,
      note: note || null,
      createdBy: actorId,
      updatedAt: new Date(),
      revokedAt: null
    })
    .onConflictDoUpdate({
      target: appAccessAllowlist.email,
      set: {
        status: 'active',
        features,
        note: note || null,
        updatedAt: new Date(),
        revokedAt: null
      }
    })

  if (requestId) {
    await db
      .update(appAccessRequests)
      .set({
        status: 'approved',
        updatedAt: new Date(),
        reviewedAt: new Date(),
        reviewedBy: actorId
      })
      .where(eq(appAccessRequests.id, requestId))
  }

  revalidateAdminAccessPaths()
}

export async function updateAppAccessAllowlistFeatures(formData: FormData) {
  await assertAdminAccess()
  const id = String(formData.get('id') ?? '')
  const features = parseAllowlistFeatureGrant(formData)

  if (!id) {
    throw new Error('Allowlist row is required')
  }

  await db
    .update(appAccessAllowlist)
    .set({
      features,
      updatedAt: new Date()
    })
    .where(eq(appAccessAllowlist.id, id))

  revalidateAdminAccessPaths()
}

export async function revokeAppAccessAllowlistEmail(formData: FormData) {
  await assertAdminAccess()
  const id = String(formData.get('id') ?? '')

  if (!id) {
    throw new Error('Allowlist row is required')
  }

  await db
    .update(appAccessAllowlist)
    .set({
      status: 'revoked',
      updatedAt: new Date(),
      revokedAt: new Date()
    })
    .where(eq(appAccessAllowlist.id, id))

  revalidateAdminAccessPaths()
}

export async function rejectAppAccessRequest(formData: FormData) {
  const actorId = await requireAdminActorId()
  const id = String(formData.get('requestId') ?? '').trim()

  if (!id) {
    throw new Error('Access request row is required')
  }

  await db
    .update(appAccessRequests)
    .set({
      status: 'rejected',
      updatedAt: new Date(),
      reviewedAt: new Date(),
      reviewedBy: actorId
    })
    .where(eq(appAccessRequests.id, id))

  revalidateAdminAccessPaths()
}

export const addAppAccessAllowlistEmail = grantAppAccessByEmail
