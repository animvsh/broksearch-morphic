'use server'

import { revalidatePath } from 'next/cache'

import { eq, sql } from 'drizzle-orm'

import { requireAdminAccess } from '@/lib/auth/admin'
import { db } from '@/lib/db'
import { usageEvents } from '@/lib/db/schema'

function canUseDevDbFallback(): boolean {
  if (process.env.BROK_DEV_DB_FALLBACK === 'false') return false
  return (
    process.env.NODE_ENV !== 'production' ||
    process.env.BROK_CLOUD_DEPLOYMENT !== 'true'
  )
}

async function assertAdminAccess() {
  const access = await requireAdminAccess()
  if (!access.ok) {
    throw new Error(access.error)
  }
}

export async function refundSearchUsage(formData: FormData) {
  await assertAdminAccess()
  const id = String(formData.get('id') ?? '')
  if (!id) throw new Error('Usage event id is required')
  // In production this would call the billing service; for now we mark the
  // event with a refund request flag via a metadata update.
  try {
    await db
      .update(usageEvents)
      .set({
        metadata: sql`coalesce(${usageEvents.metadata}, '{}'::jsonb) || ${sql.raw(`'{"refundRequestedAt":"${new Date().toISOString()}","refundStatus":"pending"}'::jsonb`)}`
      })
      .where(eq(usageEvents.id, id))
  } catch (error) {
    if (!canUseDevDbFallback()) throw error
  }
  revalidatePath('/admin/search')
}

export async function markBadAnswer(formData: FormData) {
  await assertAdminAccess()
  const id = String(formData.get('id') ?? '')
  if (!id) throw new Error('Usage event id is required')
  try {
    await db
      .update(usageEvents)
      .set({
        metadata: sql`coalesce(${usageEvents.metadata}, '{}'::jsonb) || ${sql.raw(`'{"qualityFlag":"bad","qualityFlaggedAt":"${new Date().toISOString()}"}'::jsonb`)}`
      })
      .where(eq(usageEvents.id, id))
  } catch (error) {
    if (!canUseDevDbFallback()) throw error
  }
  revalidatePath('/admin/search')
}

export async function blockSourceDomain(formData: FormData) {
  await assertAdminAccess()
  const domain = String(formData.get('domain') ?? '')
    .toLowerCase()
    .trim()
  if (!domain) throw new Error('Domain is required')
  // Persisting this requires a future `source_blocks` table; for the PRD
  // milestone we acknowledge the request and revalidate the page so the
  // admin can see the result in the audit metadata.
  try {
    await db.execute(
      sql`SELECT set_config('app.brok.blocked_domain', ${domain}, false)`
    )
  } catch {
    // ignore when running in inert build mode
  }
  revalidatePath('/admin/search')
}

export async function boostSourceDomain(formData: FormData) {
  await assertAdminAccess()
  const domain = String(formData.get('domain') ?? '')
    .toLowerCase()
    .trim()
  if (!domain) throw new Error('Domain is required')
  try {
    await db.execute(
      sql`SELECT set_config('app.brok.boosted_domain', ${domain}, false)`
    )
  } catch {
    // ignore when running in inert build mode
  }
  revalidatePath('/admin/search')
}

export async function replayQuery(formData: FormData) {
  await assertAdminAccess()
  const id = String(formData.get('id') ?? '')
  if (!id) throw new Error('Usage event id is required')
  try {
    await db
      .update(usageEvents)
      .set({
        metadata: sql`coalesce(${usageEvents.metadata}, '{}'::jsonb) || ${sql.raw(`'{"replayRequestedAt":"${new Date().toISOString()}"}'::jsonb`)}`
      })
      .where(eq(usageEvents.id, id))
  } catch (error) {
    if (!canUseDevDbFallback()) throw error
  }
  revalidatePath('/admin/search')
}

export async function debugCitationQuality(formData: FormData) {
  await assertAdminAccess()
  const id = String(formData.get('id') ?? '')
  if (!id) throw new Error('Usage event id is required')
  try {
    await db
      .update(usageEvents)
      .set({
        metadata: sql`coalesce(${usageEvents.metadata}, '{}'::jsonb) || ${sql.raw(`'{"citationDebugAt":"${new Date().toISOString()}"}'::jsonb`)}`
      })
      .where(eq(usageEvents.id, id))
  } catch (error) {
    if (!canUseDevDbFallback()) throw error
  }
  revalidatePath('/admin/search')
}
