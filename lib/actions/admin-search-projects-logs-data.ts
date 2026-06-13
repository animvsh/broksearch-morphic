import { and, desc, eq, gte, ilike, isNotNull, lte, or, sql } from 'drizzle-orm'

import { requireAdminAccess } from '@/lib/auth/admin'
import { db } from '@/lib/db'
import {
  brokCodeProjects,
  chats,
  presentations,
  usageEvents,
  workspaces
} from '@/lib/db/schema'
import { redactSensitiveData } from '@/lib/redaction'

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

function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function toFiniteNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export type SearchLogFilters = {
  dateFrom?: Date
  dateTo?: Date
  workspaceId?: string
  userId?: string
  model?: string
  provider?: string
  endpoint?: 'search' | 'chat' | 'code' | 'agents'
  status?: 'success' | 'failed' | 'all'
  hasError?: boolean
  minCost?: number
  minLatencyMs?: number
  query?: string
}

export type SearchLogRow = {
  id: string
  requestId: string
  createdAt: Date
  userId: string
  userEmail: string
  workspaceId: string
  workspaceName: string
  query: string | null
  searchMode: string
  model: string
  provider: string
  inputTokens: number
  outputTokens: number
  costUsd: number
  latencyMs: number
  status: string
  errorCode: string | null
  citationCount: number
  sourceCount: number
  metadata: Record<string, unknown> | null
}

export type SearchLogDetail = {
  id: string
  requestId: string
  createdAt: Date
  workspaceId: string
  workspaceName: string
  userId: string
  model: string
  provider: string
  surface: string
  endpoint: string
  inputTokens: number
  outputTokens: number
  costUsd: number
  latencyMs: number
  status: string
  errorCode: string | null
  query: string | null
  searchMode: string | null
  citations: number
  sourceCount: number
  metadata: Record<string, unknown> | null
  redactedRequest: unknown
  redactedResponse: unknown
}

export type SearchLogFacets = {
  workspaces: Array<{ id: string; name: string }>
  models: string[]
  providers: string[]
  statuses: string[]
  modes: string[]
}

function buildSearchConditions(filters: SearchLogFilters) {
  const conditions: ReturnType<typeof eq>[] = []
  if (filters.dateFrom) {
    conditions.push(gte(usageEvents.createdAt, filters.dateFrom))
  }
  if (filters.dateTo) {
    conditions.push(lte(usageEvents.createdAt, filters.dateTo))
  }
  if (filters.workspaceId) {
    conditions.push(eq(usageEvents.workspaceId, filters.workspaceId))
  }
  if (filters.userId) {
    conditions.push(eq(usageEvents.userId, filters.userId))
  }
  if (filters.model) {
    conditions.push(eq(usageEvents.model, filters.model))
  }
  if (filters.provider) {
    conditions.push(eq(usageEvents.provider, filters.provider))
  }
  if (filters.endpoint) {
    conditions.push(
      eq(usageEvents.endpoint, filters.endpoint) as ReturnType<typeof eq>
    )
  }
  if (filters.status && filters.status !== 'all') {
    conditions.push(eq(usageEvents.status, filters.status))
  }
  if (filters.hasError) {
    conditions.push(
      or(
        eq(usageEvents.status, 'failed'),
        isNotNull(usageEvents.errorCode)
      ) as ReturnType<typeof eq>
    )
  }
  if (typeof filters.minCost === 'number' && Number.isFinite(filters.minCost)) {
    conditions.push(
      sql`${usageEvents.billedUsd}::numeric >= ${filters.minCost.toFixed(6)}`
    )
  }
  if (
    typeof filters.minLatencyMs === 'number' &&
    Number.isFinite(filters.minLatencyMs)
  ) {
    conditions.push(sql`${usageEvents.latencyMs} >= ${filters.minLatencyMs}`)
  }
  return conditions
}

function buildMetadataSearchCondition(query: string) {
  const escaped = query.replace(/[%_]/g, '\\$&')
  const searchText = `%${escaped}%`
  return or(
    ilike(usageEvents.source, searchText),
    sql`${usageEvents.metadata}::text ilike ${searchText}`,
    sql`coalesce(${usageEvents.sessionId}, '') ilike ${searchText}`
  )
}

export async function getSearchLogsForAdmin(
  filters: SearchLogFilters = {}
): Promise<SearchLogRow[]> {
  await assertAdminAccess()

  try {
    const conditions = buildSearchConditions(filters)
    const textCondition = filters.query
      ? buildMetadataSearchCondition(filters.query)
      : undefined

    const rows = await db
      .select({
        id: usageEvents.id,
        requestId: usageEvents.requestId,
        createdAt: usageEvents.createdAt,
        userId: usageEvents.userId,
        userEmail: sql<string>`''`,
        workspaceId: usageEvents.workspaceId,
        workspaceName: workspaces.name,
        query: usageEvents.source,
        searchMode: sql<string>`coalesce(${usageEvents.metadata}->>'searchMode', ${usageEvents.surface}, 'unknown')`,
        model: usageEvents.model,
        provider: usageEvents.provider,
        inputTokens: usageEvents.inputTokens,
        outputTokens: usageEvents.outputTokens,
        costUsd: usageEvents.billedUsd,
        latencyMs: usageEvents.latencyMs,
        status: usageEvents.status,
        errorCode: usageEvents.errorCode,
        citationCount: sql<number>`coalesce((${usageEvents.metadata}->>'citationCount')::int, 0)`,
        sourceCount: sql<number>`coalesce((${usageEvents.metadata}->>'sourceCount')::int, 0)`,
        metadata: usageEvents.metadata
      })
      .from(usageEvents)
      .leftJoin(workspaces, eq(usageEvents.workspaceId, workspaces.id))
      .where(and(...conditions, ...(textCondition ? [textCondition] : [])))
      .orderBy(desc(usageEvents.createdAt))
      .limit(200)

    return rows.map(row => ({
      ...row,
      userEmail: row.userEmail || row.userId,
      workspaceName: row.workspaceName ?? 'Unknown workspace',
      costUsd: toNumber(row.costUsd),
      inputTokens: toFiniteNumber(row.inputTokens),
      outputTokens: toFiniteNumber(row.outputTokens),
      latencyMs: toFiniteNumber(row.latencyMs),
      metadata: (row.metadata ?? null) as Record<string, unknown> | null
    }))
  } catch (error) {
    if (canUseDevDbFallback()) return []
    throw error
  }
}

export async function getSearchLogDetailForAdmin(
  id: string
): Promise<SearchLogDetail | null> {
  await assertAdminAccess()

  try {
    const [row] = await db
      .select({
        id: usageEvents.id,
        requestId: usageEvents.requestId,
        createdAt: usageEvents.createdAt,
        workspaceId: usageEvents.workspaceId,
        workspaceName: workspaces.name,
        userId: usageEvents.userId,
        model: usageEvents.model,
        provider: usageEvents.provider,
        surface: usageEvents.surface,
        endpoint: usageEvents.endpoint,
        inputTokens: usageEvents.inputTokens,
        outputTokens: usageEvents.outputTokens,
        costUsd: usageEvents.billedUsd,
        latencyMs: usageEvents.latencyMs,
        status: usageEvents.status,
        errorCode: usageEvents.errorCode,
        query: usageEvents.source,
        searchMode: sql<string>`coalesce(${usageEvents.metadata}->>'searchMode', ${usageEvents.surface}, 'unknown')`,
        citations: sql<number>`coalesce((${usageEvents.metadata}->>'citationCount')::int, 0)`,
        sourceCount: sql<number>`coalesce((${usageEvents.metadata}->>'sourceCount')::int, 0)`,
        metadata: usageEvents.metadata
      })
      .from(usageEvents)
      .leftJoin(workspaces, eq(usageEvents.workspaceId, workspaces.id))
      .where(eq(usageEvents.id, id))
      .limit(1)

    if (!row) return null

    const metadata = (row.metadata ?? {}) as Record<string, unknown>
    const requestPayload =
      (metadata.request as Record<string, unknown> | undefined) ?? null
    const responsePayload =
      (metadata.response as Record<string, unknown> | undefined) ?? null

    return {
      ...row,
      workspaceName: row.workspaceName ?? 'Unknown workspace',
      costUsd: toNumber(row.costUsd),
      inputTokens: toFiniteNumber(row.inputTokens),
      outputTokens: toFiniteNumber(row.outputTokens),
      latencyMs: toFiniteNumber(row.latencyMs),
      metadata,
      redactedRequest: requestPayload
        ? redactSensitiveData(requestPayload)
        : null,
      redactedResponse: responsePayload
        ? redactSensitiveData(responsePayload)
        : null
    }
  } catch (error) {
    if (canUseDevDbFallback()) return null
    throw error
  }
}

export async function getSearchLogFacets(): Promise<SearchLogFacets> {
  await assertAdminAccess()

  try {
    const workspaceRows = await db
      .select({ id: workspaces.id, name: workspaces.name })
      .from(workspaces)
      .orderBy(workspaces.name)
      .limit(200)

    const modelRows = await db
      .selectDistinct({ model: usageEvents.model })
      .from(usageEvents)
      .orderBy(usageEvents.model)
    const providerRows = await db
      .selectDistinct({ provider: usageEvents.provider })
      .from(usageEvents)
      .orderBy(usageEvents.provider)
    const statusRows = await db
      .selectDistinct({ status: usageEvents.status })
      .from(usageEvents)
      .orderBy(usageEvents.status)
    const modeRows = await db
      .selectDistinct({
        mode: sql<string>`coalesce(${usageEvents.metadata}->>'searchMode', ${usageEvents.surface}, 'unknown')`
      })
      .from(usageEvents)
      .orderBy(sql`1`)

    return {
      workspaces: workspaceRows,
      models: modelRows.map(row => row.model).filter(Boolean),
      providers: providerRows.map(row => row.provider).filter(Boolean),
      statuses: statusRows.map(row => row.status).filter(Boolean),
      modes: modeRows.map(row => row.mode).filter(Boolean)
    }
  } catch (error) {
    if (canUseDevDbFallback()) {
      return {
        workspaces: [],
        models: [],
        providers: [],
        statuses: [],
        modes: []
      }
    }
    throw error
  }
}

export type ProjectType =
  | 'search_thread'
  | 'app_project'
  | 'presentation_deck'
  | 'api_playground_session'
  | 'shared_link'
  | 'exported_file'

export type AdminProjectRow = {
  id: string
  type: ProjectType
  name: string
  owner: string
  ownerId: string
  workspace: string
  status: string
  costUsd: number
  createdAt: Date
  lastUpdatedAt: Date
  visibility: 'public' | 'private' | 'unlisted'
  resource: string
}

export async function getAllProjectsForAdmin(): Promise<AdminProjectRow[]> {
  await assertAdminAccess()

  try {
    const chatRows = await db
      .select({
        id: chats.id,
        title: chats.title,
        userId: chats.userId,
        workspaceName: workspaces.name,
        visibility: chats.visibility,
        createdAt: chats.createdAt,
        updatedAt: sql<Date>`${chats.createdAt}`
      })
      .from(chats)
      .leftJoin(workspaces, eq(workspaces.ownerUserId, chats.userId))
      .orderBy(desc(chats.createdAt))
      .limit(200)

    const projectRows = await db
      .select({
        id: brokCodeProjects.id,
        name: brokCodeProjects.name,
        userId: brokCodeProjects.userId,
        workspaceName: workspaces.name,
        status: brokCodeProjects.status,
        createdAt: brokCodeProjects.createdAt,
        updatedAt: brokCodeProjects.updatedAt
      })
      .from(brokCodeProjects)
      .leftJoin(workspaces, eq(brokCodeProjects.workspaceId, workspaces.id))
      .orderBy(desc(brokCodeProjects.updatedAt))
      .limit(200)

    const presentationRows = await db
      .select({
        id: presentations.id,
        title: presentations.title,
        userId: presentations.userId,
        workspaceName: workspaces.name,
        status: presentations.status,
        shareId: presentations.shareId,
        isPublic: presentations.isPublic,
        createdAt: presentations.createdAt,
        updatedAt: presentations.updatedAt
      })
      .from(presentations)
      .leftJoin(workspaces, eq(presentations.workspaceId, workspaces.id))
      .orderBy(desc(presentations.updatedAt))
      .limit(200)

    const costByRow = await db
      .select({
        chatId: sql<string>`coalesce(${usageEvents.sessionId}, ${usageEvents.requestId})`,
        totalCost: sql<string>`coalesce(sum(${usageEvents.billedUsd}), 0)::text`
      })
      .from(usageEvents)
      .groupBy(sql`1`)
      .limit(500)

    const costMap = new Map<string, number>()
    for (const row of costByRow) {
      if (row.chatId) costMap.set(row.chatId, toNumber(row.totalCost))
    }

    const rows: AdminProjectRow[] = []

    for (const chat of chatRows) {
      const id = chat.id
      rows.push({
        id,
        type: 'search_thread',
        name: chat.title || 'Untitled search',
        owner: chat.userId,
        ownerId: chat.userId,
        workspace: chat.workspaceName ?? 'Unknown workspace',
        status: 'ready',
        costUsd: costMap.get(id) ?? costMap.get(chat.title ?? '') ?? 0,
        createdAt: chat.createdAt,
        lastUpdatedAt: chat.updatedAt ?? chat.createdAt,
        visibility: chat.visibility === 'public' ? 'public' : 'private',
        resource: `chat:${id}`
      })
    }

    for (const project of projectRows) {
      rows.push({
        id: project.id,
        type: 'app_project',
        name: project.name,
        owner: project.userId,
        ownerId: project.userId,
        workspace: project.workspaceName ?? 'Unknown workspace',
        status: project.status,
        costUsd: costMap.get(project.id) ?? 0,
        createdAt: project.createdAt,
        lastUpdatedAt: project.updatedAt,
        visibility: 'private',
        resource: `app_project:${project.id}`
      })
    }

    for (const presentation of presentationRows) {
      rows.push({
        id: presentation.id,
        type: presentation.shareId ? 'shared_link' : 'presentation_deck',
        name: presentation.title,
        owner: presentation.userId,
        ownerId: presentation.userId,
        workspace: presentation.workspaceName ?? 'Unknown workspace',
        status: presentation.status,
        costUsd: costMap.get(presentation.id) ?? 0,
        createdAt: presentation.createdAt,
        lastUpdatedAt: presentation.updatedAt,
        visibility: presentation.isPublic ? 'public' : 'private',
        resource: presentation.shareId
          ? `share:${presentation.shareId}`
          : `presentation:${presentation.id}`
      })
    }

    return rows
      .sort(
        (a, b) =>
          new Date(b.lastUpdatedAt).getTime() -
          new Date(a.lastUpdatedAt).getTime()
      )
      .slice(0, 200)
  } catch (error) {
    if (canUseDevDbFallback()) return []
    throw error
  }
}

export type LogEventType =
  | 'search_request'
  | 'app_generation'
  | 'app_build'
  | 'presentation_outline_generation'
  | 'presentation_slide_generation'
  | 'api_call'
  | 'api_key_created'
  | 'export_created'
  | 'share_link_created'
  | 'billing_event'
  | 'provider_error'
  | 'abuse_event'
  | 'admin_action'

export const LOG_EVENT_TYPES: LogEventType[] = [
  'search_request',
  'app_generation',
  'app_build',
  'presentation_outline_generation',
  'presentation_slide_generation',
  'api_call',
  'api_key_created',
  'export_created',
  'share_link_created',
  'billing_event',
  'provider_error',
  'abuse_event',
  'admin_action'
]

const LOG_EVENT_LABELS: Record<LogEventType, string> = {
  search_request: 'Search request',
  app_generation: 'App generation',
  app_build: 'App build',
  presentation_outline_generation: 'Presentation outline',
  presentation_slide_generation: 'Presentation slide',
  api_call: 'API call',
  api_key_created: 'API key created',
  export_created: 'Export created',
  share_link_created: 'Share link created',
  billing_event: 'Billing event',
  provider_error: 'Provider error',
  abuse_event: 'Abuse event',
  admin_action: 'Admin action'
}

export function getLogEventLabel(type: LogEventType): string {
  return LOG_EVENT_LABELS[type] ?? type
}

function classifyEvent(
  surface: string | null,
  endpoint: string | null,
  status: string,
  metadata: Record<string, unknown> | null
): LogEventType {
  const explicit = metadata?.eventType
  if (typeof explicit === 'string') {
    if ((LOG_EVENT_TYPES as string[]).includes(explicit)) {
      return explicit as LogEventType
    }
  }
  if (status && status !== 'success') {
    if (metadata?.providerError) return 'provider_error'
    if (metadata?.abuse) return 'abuse_event'
  }
  if (endpoint === 'search' || surface === 'search') return 'search_request'
  if (surface === 'brokcode' || endpoint === 'code') {
    return metadata?.build ? 'app_build' : 'app_generation'
  }
  if (surface === 'presentation') {
    return metadata?.kind === 'outline'
      ? 'presentation_outline_generation'
      : 'presentation_slide_generation'
  }
  if (metadata?.apiKey) return 'api_call'
  if (metadata?.apiKeyCreated) return 'api_key_created'
  if (metadata?.export) return 'export_created'
  if (metadata?.shareLink) return 'share_link_created'
  if (metadata?.billing) return 'billing_event'
  if (metadata?.adminAction) return 'admin_action'
  return 'search_request'
}

function deriveResource(
  eventType: LogEventType,
  metadata: Record<string, unknown> | null
): string {
  if (!metadata) return eventType
  if (eventType === 'api_call') {
    return `api:${metadata.endpoint ?? metadata.model ?? 'unknown'}`
  }
  if (eventType === 'api_key_created') {
    return `key:${metadata.apiKeyName ?? metadata.keyId ?? 'unknown'}`
  }
  if (eventType === 'export_created') {
    return `export:${metadata.exportId ?? metadata.format ?? 'unknown'}`
  }
  if (eventType === 'share_link_created') {
    return `share:${metadata.shareId ?? 'unknown'}`
  }
  if (eventType === 'billing_event') {
    return `billing:${metadata.event ?? 'event'}`
  }
  if (eventType === 'admin_action') {
    return `admin:${metadata.action ?? 'action'}`
  }
  if (eventType === 'abuse_event') {
    return `abuse:${metadata.signal ?? 'event'}`
  }
  if (eventType === 'provider_error') {
    return `provider:${metadata.provider ?? metadata.model ?? 'unknown'}`
  }
  if (eventType === 'app_build') {
    return `app_build:${metadata.projectId ?? 'unknown'}`
  }
  if (eventType === 'app_generation') {
    return `app:${metadata.projectId ?? 'unknown'}`
  }
  if (eventType === 'presentation_outline_generation') {
    return `presentation:${metadata.presentationId ?? 'unknown'}:outline`
  }
  if (eventType === 'presentation_slide_generation') {
    return `presentation:${metadata.presentationId ?? 'unknown'}:slide`
  }
  return `search:${metadata.queryId ?? 'event'}`
}

export type AdminLogEvent = {
  id: string
  requestId: string
  eventType: LogEventType
  time: Date
  userId: string
  workspace: string
  resource: string
  status: string
  model: string | null
  provider: string | null
  costUsd: number
  latencyMs: number
  errorCode: string | null
  errorMessage: string | null
  metadata: Record<string, unknown> | null
  redactedRequest: unknown
  redactedResponse: unknown
}

export type LogFilters = {
  dateFrom?: Date
  dateTo?: Date
  eventType?: LogEventType | 'all'
  userId?: string
  workspaceId?: string
  model?: string
  provider?: string
  status?: 'success' | 'failed' | 'all'
  hasError?: boolean
  requestId?: string
}

export async function getGlobalLogsForAdmin(
  filters: LogFilters = {}
): Promise<AdminLogEvent[]> {
  await assertAdminAccess()

  try {
    const conditions = []
    if (filters.dateFrom) {
      conditions.push(gte(usageEvents.createdAt, filters.dateFrom))
    }
    if (filters.dateTo) {
      conditions.push(lte(usageEvents.createdAt, filters.dateTo))
    }
    if (filters.userId) {
      conditions.push(eq(usageEvents.userId, filters.userId))
    }
    if (filters.workspaceId) {
      conditions.push(eq(usageEvents.workspaceId, filters.workspaceId))
    }
    if (filters.model) {
      conditions.push(eq(usageEvents.model, filters.model))
    }
    if (filters.provider) {
      conditions.push(eq(usageEvents.provider, filters.provider))
    }
    if (filters.status && filters.status !== 'all') {
      conditions.push(eq(usageEvents.status, filters.status))
    }
    if (filters.hasError) {
      conditions.push(
        or(
          eq(usageEvents.status, 'failed'),
          isNotNull(usageEvents.errorCode)
        ) as ReturnType<typeof eq>
      )
    }
    if (filters.requestId) {
      conditions.push(
        or(
          eq(usageEvents.requestId, filters.requestId),
          ilike(usageEvents.sessionId, `%${filters.requestId}%`)
        ) as ReturnType<typeof eq>
      )
    }

    const rows = await db
      .select({
        id: usageEvents.id,
        requestId: usageEvents.requestId,
        createdAt: usageEvents.createdAt,
        userId: usageEvents.userId,
        workspaceName: workspaces.name,
        surface: usageEvents.surface,
        endpoint: usageEvents.endpoint,
        model: usageEvents.model,
        provider: usageEvents.provider,
        status: usageEvents.status,
        costUsd: usageEvents.billedUsd,
        latencyMs: usageEvents.latencyMs,
        errorCode: usageEvents.errorCode,
        metadata: usageEvents.metadata
      })
      .from(usageEvents)
      .leftJoin(workspaces, eq(usageEvents.workspaceId, workspaces.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(usageEvents.createdAt))
      .limit(200)

    return rows
      .map(row => {
        const metadata = (row.metadata ?? {}) as Record<string, unknown>
        const eventType = classifyEvent(
          row.surface,
          row.endpoint,
          row.status,
          metadata
        )
        if (
          filters.eventType &&
          filters.eventType !== 'all' &&
          eventType !== filters.eventType
        ) {
          return null
        }
        const redactedRequest = metadata.request
          ? redactSensitiveData(metadata.request)
          : null
        const redactedResponse = metadata.response
          ? redactSensitiveData(metadata.response)
          : null
        const event: AdminLogEvent = {
          id: row.id,
          requestId: row.requestId,
          eventType,
          time: row.createdAt,
          userId: row.userId,
          workspace: row.workspaceName ?? 'Unknown workspace',
          resource: deriveResource(eventType, metadata),
          status: row.status,
          model: row.model,
          provider: row.provider,
          costUsd: toNumber(row.costUsd),
          latencyMs: row.latencyMs ?? 0,
          errorCode: row.errorCode,
          errorMessage:
            typeof metadata.errorMessage === 'string'
              ? metadata.errorMessage
              : null,
          metadata,
          redactedRequest,
          redactedResponse
        }
        return event
      })
      .filter((row): row is AdminLogEvent => row !== null)
  } catch (error) {
    if (canUseDevDbFallback()) return []
    throw error
  }
}

export async function getGlobalLogFacets(): Promise<{
  eventTypes: { id: LogEventType; label: string }[]
  workspaces: Array<{ id: string; name: string }>
  models: string[]
  providers: string[]
}> {
  await assertAdminAccess()

  try {
    const workspaceRows = await db
      .select({ id: workspaces.id, name: workspaces.name })
      .from(workspaces)
      .orderBy(workspaces.name)
      .limit(200)

    const modelRows = await db
      .selectDistinct({ model: usageEvents.model })
      .from(usageEvents)
      .orderBy(usageEvents.model)
    const providerRows = await db
      .selectDistinct({ provider: usageEvents.provider })
      .from(usageEvents)
      .orderBy(usageEvents.provider)

    return {
      eventTypes: LOG_EVENT_TYPES.map(id => ({
        id,
        label: LOG_EVENT_LABELS[id]
      })),
      workspaces: workspaceRows,
      models: modelRows.map(row => row.model).filter(Boolean),
      providers: providerRows.map(row => row.provider).filter(Boolean)
    }
  } catch (error) {
    if (canUseDevDbFallback()) {
      return {
        eventTypes: LOG_EVENT_TYPES.map(id => ({
          id,
          label: LOG_EVENT_LABELS[id]
        })),
        workspaces: [],
        models: [],
        providers: []
      }
    }
    throw error
  }
}
