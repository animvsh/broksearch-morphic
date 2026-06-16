'use server'

import { and, desc, eq, ilike, or, sql } from 'drizzle-orm'

import { requireAdminAccess } from '@/lib/auth/admin'
import { db } from '@/lib/db'
import {
  apiKeys,
  presentations,
  usageEvents,
  workspaces
} from '@/lib/db/schema'

export type AdminSearchResultType =
  | 'user'
  | 'workspace'
  | 'api_key'
  | 'project'
  | 'presentation'
  | 'usage_log'
  | 'error_log'
  | 'model'
  | 'provider'

export interface AdminSearchResult {
  type: AdminSearchResultType
  title: string
  subtitle: string
  href: string
  badge?: string
  metadata?: Record<string, unknown>
}

const MAX_PER_GROUP = 5
const MAX_QUERY_LENGTH = 120

function escapeLike(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/[%_]/g, match => `\\${match}`)
}

function normalizeQuery(raw: string): string | null {
  const trimmed = raw.trim().slice(0, MAX_QUERY_LENGTH)
  return trimmed.length === 0 ? null : trimmed
}

async function searchUsers(query: string): Promise<AdminSearchResult[]> {
  try {
    const rows = await db.execute<{
      id: string
      email: string | null
    }>(sql`
      select id, email
      from auth.users
      where email ilike ${'%' + escapeLike(query) + '%'}
      order by created_at desc
      limit ${MAX_PER_GROUP}
    `)
    return rows.map(row => ({
      type: 'user' as const,
      title: row.email ?? row.id,
      subtitle: row.id,
      href: `/admin/usage?user=${encodeURIComponent(row.id)}`,
      metadata: { userId: row.id }
    }))
  } catch {
    return []
  }
}

async function searchWorkspaces(query: string): Promise<AdminSearchResult[]> {
  try {
    const rows = await db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        ownerUserId: workspaces.ownerUserId
      })
      .from(workspaces)
      .where(ilike(workspaces.name, `%${escapeLike(query)}%`))
      .orderBy(desc(workspaces.createdAt))
      .limit(MAX_PER_GROUP)

    return rows.map(row => ({
      type: 'workspace' as const,
      title: row.name,
      subtitle: `Owner ${row.ownerUserId}`,
      href: `/admin/usage?workspace=${encodeURIComponent(row.id)}`,
      metadata: { workspaceId: row.id }
    }))
  } catch {
    return []
  }
}

async function searchApiKeys(query: string): Promise<AdminSearchResult[]> {
  try {
    const rows = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        status: apiKeys.status,
        workspaceName: workspaces.name
      })
      .from(apiKeys)
      .leftJoin(workspaces, eq(apiKeys.workspaceId, workspaces.id))
      .where(
        or(
          ilike(apiKeys.name, `%${escapeLike(query)}%`),
          ilike(apiKeys.keyPrefix, `%${escapeLike(query)}%`),
          ilike(apiKeys.id, `%${escapeLike(query)}%`)
        )
      )
      .orderBy(desc(apiKeys.createdAt))
      .limit(MAX_PER_GROUP)

    return rows.map(row => ({
      type: 'api_key' as const,
      title: row.name,
      subtitle: `${row.keyPrefix} • ${row.workspaceName ?? 'unknown workspace'}`,
      href: '/admin/brok/api-keys',
      badge: row.status,
      metadata: { apiKeyId: row.id }
    }))
  } catch {
    return []
  }
}

async function searchPresentations(
  query: string
): Promise<AdminSearchResult[]> {
  try {
    const rows = await db
      .select({
        id: presentations.id,
        title: presentations.title,
        status: presentations.status
      })
      .from(presentations)
      .where(ilike(presentations.title, `%${escapeLike(query)}%`))
      .orderBy(desc(presentations.createdAt))
      .limit(MAX_PER_GROUP)

    return rows.map(row => ({
      type: 'presentation' as const,
      title: row.title,
      subtitle: row.id,
      href: `/admin/usage?presentation=${encodeURIComponent(row.id)}`,
      badge: row.status,
      metadata: { presentationId: row.id }
    }))
  } catch {
    return []
  }
}

async function searchProjects(query: string): Promise<AdminSearchResult[]> {
  try {
    const rows = await db.execute<{
      id: string
      name: string
      status: string
    }>(sql`
      select id::text as id, name, status
      from brokcode_projects
      where name ilike ${'%' + escapeLike(query) + '%'}
        or slug ilike ${'%' + escapeLike(query) + '%'}
      order by updated_at desc
      limit ${MAX_PER_GROUP}
    `)
    return rows.map(row => ({
      type: 'project' as const,
      title: row.name,
      subtitle: row.id,
      href: '/admin/brok/playground',
      badge: row.status,
      metadata: { projectId: row.id }
    }))
  } catch {
    return []
  }
}

async function searchUsageEvents(query: string): Promise<AdminSearchResult[]> {
  try {
    const isUuidLike = /^[0-9a-f-]{8,}$/i.test(query)
    const isLikelyRequestId = query.startsWith('req_') || query.length > 12
    const conditions = []

    if (isLikelyRequestId) {
      conditions.push(ilike(usageEvents.requestId, `%${escapeLike(query)}%`))
    }

    if (isUuidLike) {
      conditions.push(
        sql`${usageEvents.id}::text ilike ${`%${escapeLike(query)}%`}`
      )
    }

    if (conditions.length === 0) {
      return []
    }

    const rows = await db
      .select({
        id: usageEvents.id,
        requestId: usageEvents.requestId,
        status: usageEvents.status,
        errorCode: usageEvents.errorCode,
        createdAt: usageEvents.createdAt
      })
      .from(usageEvents)
      .where(and(...conditions))
      .orderBy(desc(usageEvents.createdAt))
      .limit(MAX_PER_GROUP)

    return rows.map(row => ({
      type: row.status === 'success' ? 'usage_log' : 'error_log',
      title: row.requestId,
      subtitle: row.errorCode ?? row.status,
      href: '/admin/brok/logs',
      badge: row.status,
      metadata: { usageEventId: row.id }
    }))
  } catch {
    return []
  }
}

async function searchModelsAndProviders(
  query: string
): Promise<AdminSearchResult[]> {
  try {
    const rows = await db
      .select({
        model: usageEvents.model,
        provider: usageEvents.provider,
        count: sql<number>`count(*)::int`
      })
      .from(usageEvents)
      .where(
        or(
          ilike(usageEvents.model, `%${escapeLike(query)}%`),
          ilike(usageEvents.provider, `%${escapeLike(query)}%`)
        )
      )
      .groupBy(usageEvents.model, usageEvents.provider)
      .orderBy(desc(sql`count(*)`))
      .limit(MAX_PER_GROUP)

    return rows.map(row => ({
      type: row.provider === query ? 'provider' : 'model',
      title: row.model ?? 'unknown model',
      subtitle: `Provider ${row.provider} • ${row.count} requests`,
      href: '/admin/brok/providers',
      badge: row.provider
    }))
  } catch {
    return []
  }
}

export async function searchAdmin(rawQuery: string): Promise<{
  query: string
  results: AdminSearchResult[]
  totalCount: number
}> {
  const access = await requireAdminAccess()
  if (!access.ok) {
    return { query: '', results: [], totalCount: 0 }
  }

  const query = normalizeQuery(rawQuery)
  if (!query) {
    return { query: '', results: [], totalCount: 0 }
  }

  const lower = query.toLowerCase()
  const looksLikeEmail = lower.includes('@')
  const looksLikeUuid = /^[0-9a-f-]{8,}$/i.test(query)

  const tasks: Array<Promise<AdminSearchResult[]>> = []

  if (looksLikeEmail) {
    tasks.push(searchUsers(query))
  }

  tasks.push(searchWorkspaces(query))
  tasks.push(searchApiKeys(query))
  tasks.push(searchPresentations(query))
  tasks.push(searchProjects(query))

  if (looksLikeUuid) {
    tasks.push(searchUsageEvents(query))
  }

  tasks.push(searchModelsAndProviders(query))

  const groups = await Promise.all(tasks)
  const results = groups.flat()

  return {
    query,
    results: results.slice(0, 30),
    totalCount: results.length
  }
}
