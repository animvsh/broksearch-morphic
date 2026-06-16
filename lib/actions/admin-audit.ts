'use server'

import { and, desc, eq, gte, lte, or, sql } from 'drizzle-orm'

import { requireAdminAccess } from '@/lib/auth/admin'
import { db } from '@/lib/db'
import { adminAuditLogs } from '@/lib/db/schema-brok'

export type AdminAuditAction =
  | 'api_key.paused'
  | 'api_key.resumed'
  | 'api_key.revoked'
  | 'api_key.rate_limit_changed'
  | 'api_key.scopes_changed'
  | 'presentation.deleted'
  | 'presentation.share_disabled'
  | 'user.suspended'
  | 'user.unsuspended'
  | 'user.role_changed'
  | 'provider.route_changed'
  | 'provider.kill_switch_toggled'
  | 'provider.model_toggled'
  | 'rate_limit.changed'
  | 'refund.issued'
  | 'allowlist.added'
  | 'allowlist.removed'
  | 'allowlist.features_updated'

export type AdminAuditTargetType =
  | 'api_key'
  | 'presentation'
  | 'user'
  | 'provider_route'
  | 'provider'
  | 'rate_limit'
  | 'refund'
  | 'allowlist'

export interface RecordAdminAuditInput {
  action: AdminAuditAction
  targetType: AdminAuditTargetType
  targetId?: string | null
  beforeValue?: Record<string, unknown> | null
  afterValue?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
  ipAddress?: string | null
  userAgent?: string | null
}

export async function recordAdminAudit(input: RecordAdminAuditInput) {
  const access = await requireAdminAccess()

  if (!access.ok) {
    return { ok: false as const, error: access.error }
  }

  try {
    await db.insert(adminAuditLogs).values({
      adminUserId: access.user?.id ?? null,
      adminEmail: access.user?.email ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      beforeValue: input.beforeValue ?? null,
      afterValue: input.afterValue ?? null,
      metadata: input.metadata ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null
    })

    return { ok: true as const }
  } catch (error) {
    console.error('[admin-audit] failed to record audit log', error)
    return { ok: false as const, error: 'Failed to record audit log' }
  }
}

export interface AdminAuditLogEntry {
  id: string
  adminUserId: string | null
  adminEmail: string | null
  action: string
  targetType: string
  targetId: string | null
  beforeValue: Record<string, unknown> | null
  afterValue: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  ipAddress: string | null
  userAgent: string | null
  createdAt: Date
}

export interface GetAdminAuditLogsFilters {
  action?: string
  adminEmail?: string
  targetType?: string
  targetId?: string
  query?: string
  dateFrom?: Date
  dateTo?: Date
  limit?: number
}

export async function getAdminAuditLogs(
  filters: GetAdminAuditLogsFilters = {}
): Promise<AdminAuditLogEntry[]> {
  const access = await requireAdminAccess()

  if (!access.ok) {
    throw new Error(access.error)
  }

  const limit = Math.min(Math.max(filters.limit ?? 200, 1), 500)
  const conditions = []

  if (filters.action) {
    conditions.push(eq(adminAuditLogs.action, filters.action))
  }

  if (filters.adminEmail) {
    conditions.push(eq(adminAuditLogs.adminEmail, filters.adminEmail))
  }

  if (filters.targetType) {
    conditions.push(eq(adminAuditLogs.targetType, filters.targetType))
  }

  if (filters.targetId) {
    conditions.push(eq(adminAuditLogs.targetId, filters.targetId))
  }

  if (filters.dateFrom) {
    conditions.push(gte(adminAuditLogs.createdAt, filters.dateFrom))
  }

  if (filters.dateTo) {
    conditions.push(lte(adminAuditLogs.createdAt, filters.dateTo))
  }

  if (filters.query && filters.query.trim().length > 0) {
    const trimmed = `%${filters.query.trim().toLowerCase()}%`
    conditions.push(
      or(
        sql`lower(coalesce(${adminAuditLogs.adminEmail}, '')) like ${trimmed}`,
        sql`lower(coalesce(${adminAuditLogs.targetId}, '')) like ${trimmed}`,
        sql`lower(coalesce(${adminAuditLogs.action}, '')) like ${trimmed}`,
        sql`lower(coalesce(${adminAuditLogs.targetType}, '')) like ${trimmed}`
      )
    )
  }

  const baseQuery = db
    .select({
      id: adminAuditLogs.id,
      adminUserId: adminAuditLogs.adminUserId,
      adminEmail: adminAuditLogs.adminEmail,
      action: adminAuditLogs.action,
      targetType: adminAuditLogs.targetType,
      targetId: adminAuditLogs.targetId,
      beforeValue: adminAuditLogs.beforeValue,
      afterValue: adminAuditLogs.afterValue,
      metadata: adminAuditLogs.metadata,
      ipAddress: adminAuditLogs.ipAddress,
      userAgent: adminAuditLogs.userAgent,
      createdAt: adminAuditLogs.createdAt
    })
    .from(adminAuditLogs)

  const rows =
    conditions.length > 0
      ? await baseQuery
          .where(and(...conditions))
          .orderBy(desc(adminAuditLogs.createdAt))
          .limit(limit)
      : await baseQuery.orderBy(desc(adminAuditLogs.createdAt)).limit(limit)

  return rows.map(row => ({
    ...row,
    beforeValue: (row.beforeValue as Record<string, unknown> | null) ?? null,
    afterValue: (row.afterValue as Record<string, unknown> | null) ?? null,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null
  }))
}

export async function getAdminAuditLogCount(): Promise<number> {
  const access = await requireAdminAccess()

  if (!access.ok) {
    return 0
  }

  try {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(adminAuditLogs)
    return row?.count ?? 0
  } catch {
    return 0
  }
}
