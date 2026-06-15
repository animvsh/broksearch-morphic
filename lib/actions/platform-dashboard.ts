import { sql } from 'drizzle-orm'

import { ensureWorkspaceForUser } from '@/lib/actions/api-keys'
import { canUseUsageDashboardFallback } from '@/lib/actions/usage-dashboard-fallback'
import { getCurrentUserId } from '@/lib/auth/get-current-user'
import { db } from '@/lib/db'
import { canUseDevDbFallback } from '@/lib/db/dev-db-fallback'
import { withRLS } from '@/lib/db/with-rls'

import 'server-only'

type ThreadRow = {
  id: string
  title: string
  visibility: 'public' | 'private'
  createdAt: Date
  lastActivityAt: Date
  messageCount: number
  sourceCount: number
  fileCount: number
  toolCount: number
}

type SourceRow = {
  chatId: string
  chatTitle: string
  url: string | null
  title: string | null
  createdAt: Date
}

export type BackgroundTaskLedgerEntry = {
  id: string
  chatId: string | null
  kind: string
  status: string
  title: string
  space: string
  createdAt: Date
  updatedAt: Date
  startedAt: Date | null
  completedAt: Date | null
  error: string | null
}

type TaskLedgerRow = Omit<BackgroundTaskLedgerEntry, 'space'> & {
  spaceTitle: string
}

type UsageRow = {
  id: string
  requestId: string
  apiKeyId: string | null
  apiKeyName: string | null
  endpoint: string
  model: string
  provider: string
  surface: string
  runtime: string | null
  status: string
  inputTokens: number | null
  outputTokens: number | null
  searchQueries: number | null
  toolCalls: number | null
  latencyMs: number | null
  billedUsd: string | null
  createdAt: Date
}

type ApiKeyRow = {
  id: string
  name: string
  keyPrefix: string
  environment: string
  status: string
  scopes: string[]
  allowedModels: string[]
  rpmLimit: number | null
  dailyRequestLimit: number | null
  monthlyBudgetCents: number | null
  lastUsedAt: Date | null
  createdAt: Date
}

type WorkspaceRow = {
  id: string
  name: string
  plan: string
  status: string
  monthlyBudgetCents: number | null
  createdAt: Date
}

export type LibraryThread = ThreadRow & {
  href: string
  space: string
}

export type SourceSummary = {
  domain: string
  count: number
  latestTitle: string
  latestUrl: string
  latestChatId: string
  latestChatTitle: string
  space: string
}

export type ResearchSpaceSummary = {
  id: string
  name: string
  description: string
  threadCount: number
  sourceCount: number
  fileCount: number
  taskCount: number
  latestAt: Date | null
  threads: LibraryThread[]
}

export type WorkspaceKnowledgeData = {
  userId: string | null
  threads: LibraryThread[]
  publicThreads: LibraryThread[]
  sourceDomains: SourceSummary[]
  spaces: ResearchSpaceSummary[]
  tasks: BackgroundTaskLedgerEntry[]
  activeTasks: BackgroundTaskLedgerEntry[]
  totals: {
    threads: number
    sources: number
    files: number
    publicThreads: number
    tasks: number
    activeTasks: number
  }
}

export type UsageDashboardData = {
  workspace: WorkspaceRow
  apiKeys: ApiKeyRow[]
  recentEvents: UsageRow[]
  daily: Array<{
    day: string
    requests: number
    tokens: number
    billedUsd: number
    errors: number
  }>
  endpointSplit: Array<{ label: string; requests: number; tokens: number }>
  keyUsage: Array<{
    id: string
    name: string
    prefix: string
    requests: number
    tokens: number
    billedUsd: number
    lastUsedAt: Date | null
  }>
  totals: {
    requests30d: number
    tokens30d: number
    billedUsd30d: number
    errors30d: number
    activeKeys: number
    budgetUsedPercent: number | null
  }
}

const SPACE_RULES = [
  {
    id: 'research',
    name: 'Research',
    description: 'Saved search threads, citations, web sources, and files.',
    matches: ['search', 'research', 'source', 'cite', 'web', 'latest']
  },
  {
    id: 'mail',
    name: 'BrokMail',
    description: 'Inbox, drafting, scheduling, and Composio email work.',
    matches: ['mail', 'gmail', 'email', 'inbox', 'calendar', 'meeting']
  },
  {
    id: 'code',
    name: 'BrokCode',
    description:
      'Coding-agent runs, previews, repo context, and runtime tasks.',
    matches: ['code', 'github', 'repo', 'build', 'deploy', 'runtime', 'api key']
  },
  {
    id: 'api',
    name: 'API Platform',
    description: 'Usage, billing, provider routing, and platform operations.',
    matches: ['api', 'usage', 'billing', 'admin', 'provider', 'model', 'key']
  }
]

function toNumber(value: unknown) {
  if (typeof value === 'number') return value
  if (typeof value === 'string') return Number(value) || 0
  return 0
}

function getDomain(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, '')
  } catch {
    return 'unknown source'
  }
}

function inferSpace(title: string) {
  const lower = title.toLowerCase()
  return (
    SPACE_RULES.find(rule =>
      rule.matches.some(keyword => lower.includes(keyword))
    ) ?? SPACE_RULES[0]
  )
}

function emptyUsageDashboardData(workspace: WorkspaceRow): UsageDashboardData {
  return {
    workspace,
    apiKeys: [],
    recentEvents: [],
    daily: [],
    endpointSplit: [],
    keyUsage: [],
    totals: {
      requests30d: 0,
      tokens30d: 0,
      billedUsd30d: 0,
      errors30d: 0,
      activeKeys: 0,
      budgetUsedPercent: null
    }
  }
}

async function getThreadRows(userId: string) {
  return withRLS(userId, async tx => {
    const rows = await tx.execute(sql`
      select
        c.id,
        c.title,
        c.visibility,
        c.created_at as "createdAt",
        coalesce(max(m.created_at), c.created_at) as "lastActivityAt",
        count(distinct m.id)::int as "messageCount",
        count(distinct p.id) filter (
          where p.type in ('source-url', 'source-document')
            or p.source_url_url is not null
            or p.source_document_url is not null
        )::int as "sourceCount",
        count(distinct p.id) filter (
          where p.type = 'file'
            or p.file_url is not null
            or p.source_document_filename is not null
        )::int as "fileCount",
        count(distinct p.id) filter (
          where p.type like 'tool-%'
            or p.tool_tool_call_id is not null
        )::int as "toolCount"
      from chats c
      left join messages m on m.chat_id = c.id
      left join parts p on p.message_id = m.id
      where c.user_id = ${userId}
      group by c.id, c.title, c.visibility, c.created_at
      order by coalesce(max(m.created_at), c.created_at) desc
      limit 80
    `)

    return rows as unknown as ThreadRow[]
  })
}

async function getSourceRows(userId: string) {
  return withRLS(userId, async tx => {
    const rows = await tx.execute(sql`
      select
        c.id as "chatId",
        c.title as "chatTitle",
        coalesce(p.source_url_url, p.source_document_url) as url,
        coalesce(p.source_url_title, p.source_document_title, p.source_document_filename) as title,
        p.created_at as "createdAt"
      from chats c
      inner join messages m on m.chat_id = c.id
      inner join parts p on p.message_id = m.id
      where c.user_id = ${userId}
        and (
          p.source_url_url is not null
          or p.source_document_url is not null
        )
      order by p.created_at desc
      limit 200
    `)

    return rows as unknown as SourceRow[]
  })
}

async function getTaskRows(userId: string) {
  return withRLS(userId, async tx => {
    const rows = await tx.execute(sql`
      select
        bt.id,
        bt.chat_id as "chatId",
        bt.kind,
        bt.status,
        bt.title,
        case
          when bt.chat_id is not null then coalesce(c.title, bt.title)
          else bt.title
        end as "spaceTitle",
        bt.started_at as "startedAt",
        bt.completed_at as "completedAt",
        bt.error,
        bt.created_at as "createdAt",
        bt.updated_at as "updatedAt"
      from background_tasks bt
      left join chats c on c.id = bt.chat_id and c.user_id = bt.user_id
      where bt.user_id = ${userId}
      order by bt.created_at desc
      limit 80
    `)

    return (rows as unknown as TaskLedgerRow[]).map(row => ({
      id: row.id,
      chatId: row.chatId,
      kind: row.kind,
      status: row.status,
      title: row.title,
      space: inferSpace(row.spaceTitle).id,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      error: row.error
    }))
  })
}

async function getUsageEventColumns() {
  const rows = (await db.execute(sql`
    select column_name as name
    from information_schema.columns
    where table_name = 'usage_events'
  `)) as unknown as Array<{ name: string }>

  return new Set(rows.map(row => row.name))
}

function summarizeSources(
  rows: SourceRow[],
  threadsById: Map<string, LibraryThread>
) {
  const byDomain = new Map<string, SourceSummary>()

  for (const row of rows) {
    if (!row.url) continue
    const domain = getDomain(row.url)
    const thread = threadsById.get(row.chatId)
    const existing = byDomain.get(domain)

    if (!existing) {
      byDomain.set(domain, {
        domain,
        count: 1,
        latestTitle: row.title || domain,
        latestUrl: row.url,
        latestChatId: row.chatId,
        latestChatTitle: row.chatTitle,
        space: thread?.space ?? inferSpace(row.chatTitle).id
      })
      continue
    }

    existing.count += 1
  }

  return Array.from(byDomain.values()).sort((a, b) => b.count - a.count)
}

export async function getWorkspaceKnowledgeData(): Promise<WorkspaceKnowledgeData> {
  const userId = await getCurrentUserId()

  if (!userId) {
    return {
      userId: null,
      threads: [],
      publicThreads: [],
      sourceDomains: [],
      spaces: [],
      tasks: [],
      activeTasks: [],
      totals: {
        threads: 0,
        sources: 0,
        files: 0,
        publicThreads: 0,
        tasks: 0,
        activeTasks: 0
      }
    }
  }

  let threadRows: ThreadRow[]
  let sourceRows: SourceRow[]
  let taskRows: BackgroundTaskLedgerEntry[]

  try {
    ;[threadRows, sourceRows, taskRows] = await Promise.all([
      getThreadRows(userId),
      getSourceRows(userId),
      getTaskRows(userId)
    ])
  } catch (error) {
    if (canUseDevDbFallback(error)) {
      return {
        userId,
        threads: [],
        publicThreads: [],
        sourceDomains: [],
        spaces: SPACE_RULES.map(rule => ({
          id: rule.id,
          name: rule.name,
          description: rule.description,
          threadCount: 0,
          sourceCount: 0,
          fileCount: 0,
          taskCount: 0,
          latestAt: null,
          threads: []
        })),
        tasks: [],
        activeTasks: [],
        totals: {
          threads: 0,
          sources: 0,
          files: 0,
          publicThreads: 0,
          tasks: 0,
          activeTasks: 0
        }
      }
    }

    throw error
  }

  const threads = threadRows.map(row => ({
    ...row,
    href: `/search/${row.id}`,
    space: inferSpace(row.title).id,
    messageCount: toNumber(row.messageCount),
    sourceCount: toNumber(row.sourceCount),
    fileCount: toNumber(row.fileCount),
    toolCount: toNumber(row.toolCount)
  }))

  const activeTasks = taskRows.filter(task =>
    ['queued', 'running'].includes(task.status)
  )
  const threadsById = new Map(threads.map(thread => [thread.id, thread]))
  const sourceDomains = summarizeSources(sourceRows, threadsById)
  const spaces = SPACE_RULES.map(rule => {
    const spaceThreads = threads.filter(thread => thread.space === rule.id)
    return {
      id: rule.id,
      name: rule.name,
      description: rule.description,
      threadCount: spaceThreads.length,
      sourceCount: spaceThreads.reduce(
        (sum, thread) => sum + thread.sourceCount,
        0
      ),
      fileCount: spaceThreads.reduce(
        (sum, thread) => sum + thread.fileCount,
        0
      ),
      taskCount: taskRows.filter(task => task.space === rule.id).length,
      latestAt: spaceThreads[0]?.lastActivityAt ?? null,
      threads: spaceThreads.slice(0, 5)
    }
  })

  return {
    userId,
    threads,
    publicThreads: threads.filter(thread => thread.visibility === 'public'),
    sourceDomains,
    spaces,
    tasks: taskRows,
    activeTasks,
    totals: {
      threads: threads.length,
      sources: threads.reduce((sum, thread) => sum + thread.sourceCount, 0),
      files: threads.reduce((sum, thread) => sum + thread.fileCount, 0),
      publicThreads: threads.filter(thread => thread.visibility === 'public')
        .length,
      tasks: taskRows.length,
      activeTasks: activeTasks.length
    }
  }
}

export async function getUsageDashboardData(
  userId: string
): Promise<UsageDashboardData> {
  const workspace = await ensureWorkspaceForUser(userId)
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const sinceIso = since.toISOString()
  let keys: ApiKeyRow[]
  let recentEvents: UsageRow[]
  let dailyRows: Array<{
    day: string
    requests: number
    tokens: number
    billedUsd: string
    errors: number
  }>
  let endpointRows: Array<{ label: string; requests: number; tokens: number }>
  let keyRows: Array<{
    id: string
    name: string
    prefix: string
    requests: number
    tokens: number
    billedUsd: string
    lastUsedAt: Date | null
  }>

  try {
    const usageColumns = await getUsageEventColumns()
    const surfaceColumn = usageColumns.has('surface')
      ? sql`ue.surface`
      : sql`'api'::text`
    const runtimeColumn = usageColumns.has('runtime')
      ? sql`ue.runtime`
      : sql`null::text`

    ;[keys, recentEvents, dailyRows, endpointRows, keyRows] = await Promise.all(
      [
        db.execute(sql`
        select
          id,
          name,
          key_prefix as "keyPrefix",
          environment,
          status,
          scopes,
          allowed_models as "allowedModels",
          rpm_limit as "rpmLimit",
          daily_request_limit as "dailyRequestLimit",
          monthly_budget_cents as "monthlyBudgetCents",
          last_used_at as "lastUsedAt",
          created_at as "createdAt"
        from api_keys
        where workspace_id = ${workspace.id}
        order by created_at desc
      `) as Promise<ApiKeyRow[]>,
        db.execute(sql`
        select
          ue.id,
          ue.request_id as "requestId",
          ue.api_key_id as "apiKeyId",
          ak.name as "apiKeyName",
          ue.endpoint,
          ue.model,
          ue.provider,
          ${surfaceColumn} as "surface",
          ${runtimeColumn} as "runtime",
          ue.status,
          ue.input_tokens as "inputTokens",
          ue.output_tokens as "outputTokens",
          ue.search_queries as "searchQueries",
          ue.tool_calls as "toolCalls",
          ue.latency_ms as "latencyMs",
          ue.billed_usd as "billedUsd",
          ue.created_at as "createdAt"
        from usage_events ue
        left join api_keys ak on ak.id = ue.api_key_id
        where ue.workspace_id = ${workspace.id}
        order by ue.created_at desc
        limit 80
      `) as Promise<UsageRow[]>,
        db.execute(sql`
        select
          to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day,
          count(*)::int as requests,
          coalesce(sum(input_tokens + output_tokens + cached_tokens), 0)::int as tokens,
          coalesce(sum(billed_usd), 0)::text as "billedUsd",
          count(*) filter (where status != 'success')::int as errors
        from usage_events
        where workspace_id = ${workspace.id}
          and created_at >= ${sinceIso}::timestamp
        group by date_trunc('day', created_at)
        order by day asc
      `) as Promise<
          Array<{
            day: string
            requests: number
            tokens: number
            billedUsd: string
            errors: number
          }>
        >,
        db.execute(sql`
        select
          endpoint as label,
          count(*)::int as requests,
          coalesce(sum(input_tokens + output_tokens + cached_tokens), 0)::int as tokens
        from usage_events
        where workspace_id = ${workspace.id}
          and created_at >= ${sinceIso}::timestamp
        group by endpoint
        order by requests desc
      `) as Promise<Array<{ label: string; requests: number; tokens: number }>>,
        db.execute(sql`
        select
          coalesce(ak.id::text, 'unkeyed') as id,
          coalesce(ak.name, 'Browser or saved runtime key') as name,
          coalesce(ak.key_prefix, 'account') as prefix,
          count(ue.id)::int as requests,
          coalesce(sum(ue.input_tokens + ue.output_tokens + ue.cached_tokens), 0)::int as tokens,
          coalesce(sum(ue.billed_usd), 0)::text as "billedUsd",
          max(ue.created_at) as "lastUsedAt"
        from usage_events ue
        left join api_keys ak on ak.id = ue.api_key_id
        where ue.workspace_id = ${workspace.id}
          and ue.created_at >= ${sinceIso}::timestamp
        group by ak.id, ak.name, ak.key_prefix
        order by requests desc
        limit 12
      `) as Promise<
          Array<{
            id: string
            name: string
            prefix: string
            requests: number
            tokens: number
            billedUsd: string
            lastUsedAt: Date | null
          }>
        >
      ]
    )
  } catch (error) {
    if (canUseUsageDashboardFallback(error)) {
      console.error('Usage dashboard lookup failed; using empty data:', error)
      return emptyUsageDashboardData(workspace as WorkspaceRow)
    }

    throw error
  }

  const daily = dailyRows.map(row => ({
    ...row,
    requests: toNumber(row.requests),
    tokens: toNumber(row.tokens),
    billedUsd: toNumber(row.billedUsd),
    errors: toNumber(row.errors)
  }))
  const keyUsage = keyRows.map(row => ({
    ...row,
    requests: toNumber(row.requests),
    tokens: toNumber(row.tokens),
    billedUsd: toNumber(row.billedUsd)
  }))
  const billedUsd30d = daily.reduce((sum, row) => sum + row.billedUsd, 0)
  const monthlyBudgetCents = workspace.monthlyBudgetCents ?? 0
  const keyBudgetCents = keys.reduce(
    (sum, key) => sum + (key.monthlyBudgetCents ?? 0),
    0
  )
  const budgetCents = monthlyBudgetCents || keyBudgetCents

  return {
    workspace: workspace as WorkspaceRow,
    apiKeys: keys,
    recentEvents,
    daily,
    endpointSplit: endpointRows.map(row => ({
      ...row,
      requests: toNumber(row.requests),
      tokens: toNumber(row.tokens)
    })),
    keyUsage,
    totals: {
      requests30d: daily.reduce((sum, row) => sum + row.requests, 0),
      tokens30d: daily.reduce((sum, row) => sum + row.tokens, 0),
      billedUsd30d,
      errors30d: daily.reduce((sum, row) => sum + row.errors, 0),
      activeKeys: keys.filter(key => key.status === 'active').length,
      budgetUsedPercent: budgetCents
        ? Math.min(100, (billedUsd30d / (budgetCents / 100)) * 100)
        : null
    }
  }
}

// ============================================================================
// Brok Library
// ============================================================================

export type LibraryItemKind =
  | 'search'
  | 'chat'
  | 'project'
  | 'presentation'
  | 'api_session'

export type LibraryItemStatus = 'active' | 'archived' | 'shared' | 'deleted'

export type LibrarySort = 'recent' | 'most_used' | 'most_cited'

export type LibraryItem = {
  id: string
  kind: LibraryItemKind
  title: string
  summary: string | null
  href: string
  model: string | null
  status: LibraryItemStatus
  isPublic: boolean
  useCount: number
  citeCount: number
  tags: string[]
  updatedAt: Date
  lastUsedAt: Date
}

export type LibraryTagSummary = {
  id: string
  name: string
  color: string | null
  count: number
}

export type LibraryData = {
  items: LibraryItem[]
  tags: LibraryTagSummary[]
  totals: {
    items: number
    archived: number
    public: number
    byKind: Record<LibraryItemKind, number>
  }
}

const LIBRARY_KIND_LABELS: Record<LibraryItemKind, string> = {
  search: 'Search',
  chat: 'Chat',
  project: 'App project',
  presentation: 'Presentation',
  api_session: 'API session'
}

const LIBRARY_KIND_ORDER: LibraryItemKind[] = [
  'search',
  'chat',
  'project',
  'presentation',
  'api_session'
]

export function getLibraryKindLabel(kind: LibraryItemKind) {
  return LIBRARY_KIND_LABELS[kind]
}

export function getLibraryKindOrder() {
  return [...LIBRARY_KIND_ORDER]
}

const LIBRARY_SORT_LABELS: Record<LibrarySort, string> = {
  recent: 'Most recent',
  most_used: 'Most used',
  most_cited: 'Most cited'
}

export function getLibrarySortLabel(sort: LibrarySort) {
  return LIBRARY_SORT_LABELS[sort]
}

type LibraryRow = {
  id: string
  kind: LibraryItemKind
  title: string
  summary: string | null
  href: string
  model: string | null
  status: LibraryItemStatus
  isPublic: boolean
  useCount: number
  citeCount: number
  updatedAt: Date
  lastUsedAt: Date
}

const EMPTY_LIBRARY_TOTALS: LibraryData['totals'] = {
  items: 0,
  archived: 0,
  public: 0,
  byKind: {
    search: 0,
    chat: 0,
    project: 0,
    presentation: 0,
    api_session: 0
  }
}

function emptyLibraryData(): LibraryData {
  return {
    items: [],
    tags: [],
    totals: {
      ...EMPTY_LIBRARY_TOTALS,
      byKind: { ...EMPTY_LIBRARY_TOTALS.byKind }
    }
  }
}

async function getLibraryItemRows(userId: string) {
  try {
    return (await withRLS(userId, async tx => {
      const result = await tx.execute(sql`
        select
          li.id,
          li.kind,
          li.title,
          li.summary,
          li.href,
          li.model,
          li.status,
          li.is_public as "isPublic",
          li.use_count as "useCount",
          li.cite_count as "citeCount",
          li.updated_at as "updatedAt",
          li.last_used_at as "lastUsedAt"
        from library_items li
        where li.user_id = ${userId}
          and li.status <> 'deleted'
        order by li.updated_at desc
        limit 200
      `)
      return result as unknown as LibraryRow[]
    })) as LibraryRow[]
  } catch (error) {
    if (canUseDevDbFallback(error)) {
      return [] as LibraryRow[]
    }
    throw error
  }
}

async function getLibraryTagRows(userId: string) {
  try {
    return (await withRLS(userId, async tx => {
      const result = await tx.execute(sql`
        select
          lt.id,
          lt.name,
          lt.color,
          count(lit.library_item_id)::int as count
        from library_tags lt
        left join library_item_tags lit on lit.tag_id = lt.id
        where lt.user_id = ${userId}
        group by lt.id, lt.name, lt.color
        order by count desc nulls last, lt.name asc
        limit 50
      `)
      return result as unknown as Array<{
        id: string
        name: string
        color: string | null
        count: number
      }>
    })) as Array<{
      id: string
      name: string
      color: string | null
      count: number
    }>
  } catch (error) {
    if (canUseDevDbFallback(error)) {
      return [] as Array<{
        id: string
        name: string
        color: string | null
        count: number
      }>
    }
    throw error
  }
}

async function getLibraryTagAssignments(userId: string) {
  try {
    return (await withRLS(userId, async tx => {
      const result = await tx.execute(sql`
        select
          lit.library_item_id as "libraryItemId",
          lt.name
        from library_item_tags lit
        inner join library_tags lt on lt.id = lit.tag_id
        inner join library_items li on li.id = lit.library_item_id
        where li.user_id = ${userId}
      `)
      return result as unknown as Array<{ libraryItemId: string; name: string }>
    })) as Array<{ libraryItemId: string; name: string }>
  } catch (error) {
    if (canUseDevDbFallback(error)) {
      return [] as Array<{ libraryItemId: string; name: string }>
    }
    throw error
  }
}

function applyLibraryFilters(
  rows: LibraryRow[],
  filters: {
    query?: string
    kinds?: LibraryItemKind[]
    statuses?: LibraryItemStatus[]
    tagIds?: string[]
    tagNames?: string[]
    sort?: LibrarySort
    dateFrom?: Date
    dateTo?: Date
  },
  tagAssignments: Array<{ libraryItemId: string; name: string }>,
  tagLookup: Map<string, string>
) {
  const query = filters.query?.trim().toLowerCase()
  const kinds = new Set(filters.kinds ?? [])
  const statuses = new Set(filters.statuses ?? [])
  const tagNames = new Set(filters.tagNames ?? [])
  const tagIds = new Set(filters.tagIds ?? [])

  const tagNamesByItemId = new Map<string, Set<string>>()
  for (const assignment of tagAssignments) {
    const list = tagNamesByItemId.get(assignment.libraryItemId) ?? new Set()
    list.add(assignment.name)
    tagNamesByItemId.set(assignment.libraryItemId, list)
  }

  let filtered = rows.filter(row => {
    if (kinds.size > 0 && !kinds.has(row.kind)) return false
    if (statuses.size > 0 && !statuses.has(row.status)) return false
    if (filters.dateFrom && row.updatedAt < filters.dateFrom) return false
    if (filters.dateTo && row.updatedAt > filters.dateTo) return false
    if (tagIds.size > 0) {
      // filter by tag id is not currently stored per item; reserved for future
      return true
    }
    if (tagNames.size > 0) {
      const itemTags = tagNamesByItemId.get(row.id) ?? new Set()
      const matches = Array.from(tagNames).some(name => itemTags.has(name))
      if (!matches) return false
    }
    if (query) {
      const haystack =
        `${row.title} ${row.summary ?? ''} ${row.model ?? ''}`.toLowerCase()
      if (!haystack.includes(query)) return false
    }
    return true
  })

  const sort = filters.sort ?? 'recent'
  filtered = [...filtered].sort((a, b) => {
    if (sort === 'most_used') {
      if (b.useCount !== a.useCount) return b.useCount - a.useCount
      return b.updatedAt.getTime() - a.updatedAt.getTime()
    }
    if (sort === 'most_cited') {
      if (b.citeCount !== a.citeCount) return b.citeCount - a.citeCount
      return b.updatedAt.getTime() - a.updatedAt.getTime()
    }
    return b.updatedAt.getTime() - a.updatedAt.getTime()
  })

  return filtered.map(row => ({
    ...row,
    tags: Array.from(tagNamesByItemId.get(row.id) ?? [])
  }))
}

export type LibraryFiltersInput = {
  query?: string
  kinds?: LibraryItemKind[]
  statuses?: LibraryItemStatus[]
  tagNames?: string[]
  sort?: LibrarySort
  dateFrom?: string
  dateTo?: string
}

export async function getLibraryData(
  filters: LibraryFiltersInput = {}
): Promise<LibraryData> {
  const userId = await getCurrentUserId()
  if (!userId) return emptyLibraryData()

  const [itemRows, tagRows, tagAssignments] = await Promise.all([
    getLibraryItemRows(userId),
    getLibraryTagRows(userId),
    getLibraryTagAssignments(userId)
  ])

  const tagLookup = new Map<string, string>()
  for (const tag of tagRows) {
    tagLookup.set(tag.id, tag.name)
  }

  const dateFrom = filters.dateFrom ? new Date(filters.dateFrom) : undefined
  const dateTo = filters.dateTo ? new Date(filters.dateTo) : undefined

  const items = applyLibraryFilters(
    itemRows,
    {
      query: filters.query,
      kinds: filters.kinds,
      statuses: filters.statuses,
      tagNames: filters.tagNames,
      sort: filters.sort,
      dateFrom,
      dateTo
    },
    tagAssignments,
    tagLookup
  )

  const totals: LibraryData['totals'] = {
    items: items.length,
    archived: items.filter(item => item.status === 'archived').length,
    public: items.filter(item => item.isPublic).length,
    byKind: LIBRARY_KIND_ORDER.reduce(
      (acc, kind) => {
        acc[kind] = items.filter(item => item.kind === kind).length
        return acc
      },
      {} as Record<LibraryItemKind, number>
    )
  }

  return {
    items,
    tags: tagRows.map(tag => ({
      id: tag.id,
      name: tag.name,
      color: tag.color,
      count: Number(tag.count) || 0
    })),
    totals
  }
}

// ============================================================================
// Brok Spaces
// ============================================================================

export type SpaceRole = 'owner' | 'editor' | 'viewer'
export type SpaceVisibility = 'private' | 'link' | 'public'

export type SpaceSummary = {
  id: string
  slug: string
  name: string
  description: string | null
  ownerUserId: string
  visibility: SpaceVisibility
  iconColor: string | null
  role: SpaceRole
  memberCount: number
  threadCount: number
  projectCount: number
  presentationCount: number
  lastActivityAt: Date
  createdAt: Date
  updatedAt: Date
}

export type SpaceMember = {
  id: string
  userId: string
  email: string | null
  displayName: string | null
  role: SpaceRole
  lastActiveAt: Date | null
  invitedAt: Date
  acceptedAt: Date | null
}

export type SpaceProject = {
  id: string
  title: string
  description: string | null
  status: string
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

export type SpaceInvite = {
  id: string
  email: string
  role: SpaceRole
  invitedBy: string
  expiresAt: Date | null
  createdAt: Date
}

export type SpaceData = {
  space: SpaceSummary
  members: SpaceMember[]
  projects: SpaceProject[]
  invites: SpaceInvite[]
  recentThreads: LibraryItem[]
  totals: {
    members: number
    projects: number
    invites: number
    threads: number
  }
}

async function getSpaceSummaryRow(
  userId: string,
  spaceId: string
): Promise<SpaceSummary | null> {
  try {
    return (await withRLS(userId, async tx => {
      const result = await tx.execute(sql`
        select
          s.id,
          s.slug,
          s.name,
          s.description,
          s.owner_user_id as "ownerUserId",
          s.visibility,
          s.icon_color as "iconColor",
          case
            when s.owner_user_id = ${userId} then 'owner'
            else sm.role
          end as role,
          s.member_count as "memberCount",
          s.thread_count as "threadCount",
          s.project_count as "projectCount",
          s.presentation_count as "presentationCount",
          s.last_activity_at as "lastActivityAt",
          s.created_at as "createdAt",
          s.updated_at as "updatedAt"
        from spaces s
        left join space_members sm
          on sm.space_id = s.id
          and sm.user_id = ${userId}
        where s.id = ${spaceId}::uuid
          and (
            s.owner_user_id = ${userId}
            or sm.user_id = ${userId}
          )
        limit 1
      `)
      const rows = result as unknown as SpaceSummary[]
      return rows[0] ?? null
    })) as SpaceSummary | null
  } catch (error) {
    if (canUseDevDbFallback(error)) return null
    throw error
  }
}

async function getSpaceMembersRows(
  userId: string,
  spaceId: string
): Promise<SpaceMember[]> {
  try {
    return (await withRLS(userId, async tx => {
      const result = await tx.execute(sql`
        select
          id,
          user_id as "userId",
          email,
          display_name as "displayName",
          role,
          last_active_at as "lastActiveAt",
          invited_at as "invitedAt",
          accepted_at as "acceptedAt"
        from space_members
        where space_id = ${spaceId}::uuid
          and exists (
            select 1
            from spaces s
            left join space_members requester
              on requester.space_id = s.id
              and requester.user_id = ${userId}
            where s.id = ${spaceId}::uuid
              and (
                s.owner_user_id = ${userId}
                or requester.user_id = ${userId}
              )
          )
        order by role asc, invited_at asc
      `)
      return result as unknown as SpaceMember[]
    })) as SpaceMember[]
  } catch (error) {
    if (canUseDevDbFallback(error)) return []
    throw error
  }
}

async function getSpaceProjectsRows(
  userId: string,
  spaceId: string
): Promise<SpaceProject[]> {
  try {
    return (await withRLS(userId, async tx => {
      const result = await tx.execute(sql`
        select
          id,
          title,
          description,
          status,
          created_by as "createdBy",
          created_at as "createdAt",
          updated_at as "updatedAt"
        from space_projects
        where space_id = ${spaceId}::uuid
          and exists (
            select 1
            from spaces s
            left join space_members requester
              on requester.space_id = s.id
              and requester.user_id = ${userId}
            where s.id = ${spaceId}::uuid
              and (
                s.owner_user_id = ${userId}
                or requester.user_id = ${userId}
              )
          )
        order by updated_at desc
        limit 100
      `)
      return result as unknown as SpaceProject[]
    })) as SpaceProject[]
  } catch (error) {
    if (canUseDevDbFallback(error)) return []
    throw error
  }
}

async function getSpaceInvitesRows(
  userId: string,
  spaceId: string
): Promise<SpaceInvite[]> {
  try {
    return (await withRLS(userId, async tx => {
      const result = await tx.execute(sql`
        select
          id,
          email,
          role,
          invited_by as "invitedBy",
          expires_at as "expiresAt",
          created_at as "createdAt"
        from space_invites
        where space_id = ${spaceId}::uuid
          and accepted_at is null
          and exists (
            select 1
            from spaces s
            left join space_members requester
              on requester.space_id = s.id
              and requester.user_id = ${userId}
            where s.id = ${spaceId}::uuid
              and (
                s.owner_user_id = ${userId}
                or requester.user_id = ${userId}
              )
          )
        order by created_at desc
        limit 100
      `)
      return result as unknown as SpaceInvite[]
    })) as SpaceInvite[]
  } catch (error) {
    if (canUseDevDbFallback(error)) return []
    throw error
  }
}

async function getSpaceRecentThreads(
  userId: string,
  spaceId: string
): Promise<LibraryRow[]> {
  try {
    return (await withRLS(userId, async tx => {
      const result = await tx.execute(sql`
        select
          li.id,
          li.kind,
          li.title,
          li.summary,
          li.href,
          li.model,
          li.status,
          li.is_public as "isPublic",
          li.use_count as "useCount",
          li.cite_count as "citeCount",
          li.updated_at as "updatedAt",
          li.last_used_at as "lastUsedAt"
        from library_items li
        where li.user_id = ${userId}
          and li.metadata->>'spaceId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          and (li.metadata->>'spaceId')::uuid = ${spaceId}::uuid
          and li.status <> 'deleted'
        order by li.updated_at desc
        limit 12
      `)
      return result as unknown as LibraryRow[]
    })) as LibraryRow[]
  } catch (error) {
    if (canUseDevDbFallback(error)) return []
    throw error
  }
}

export async function getSpaceData(spaceId: string): Promise<SpaceData | null> {
  const userId = await getCurrentUserId()
  if (!userId) return null

  const summary = await getSpaceSummaryRow(userId, spaceId)
  if (!summary) return null

  const [members, projects, invites, recentThreads] = await Promise.all([
    getSpaceMembersRows(userId, spaceId),
    getSpaceProjectsRows(userId, spaceId),
    getSpaceInvitesRows(userId, spaceId),
    getSpaceRecentThreads(userId, spaceId)
  ])
  const ownerMember: SpaceMember = {
    id: `${summary.id}:owner`,
    userId: summary.ownerUserId,
    email: null,
    displayName: 'Space owner',
    role: 'owner',
    lastActiveAt: summary.lastActivityAt,
    invitedAt: summary.createdAt,
    acceptedAt: summary.createdAt
  }
  const displayMembers = members.some(member => member.role === 'owner')
    ? members
    : [ownerMember, ...members]

  return {
    space: summary,
    members: displayMembers,
    projects,
    invites,
    recentThreads: recentThreads.map(row => ({ ...row, tags: [] })),
    totals: {
      members: displayMembers.length,
      projects: projects.length,
      invites: invites.length,
      threads: recentThreads.length
    }
  }
}

export async function listSpaces(userId?: string): Promise<SpaceSummary[]> {
  const owner = userId ?? (await getCurrentUserId())
  if (!owner) return []

  try {
    return (await withRLS(owner, async tx => {
      const result = await tx.execute(sql`
        select
          s.id,
          s.slug,
          s.name,
          s.description,
          s.owner_user_id as "ownerUserId",
          s.visibility,
          s.icon_color as "iconColor",
          coalesce(sm.role, 'owner') as role,
          s.member_count as "memberCount",
          s.thread_count as "threadCount",
          s.project_count as "projectCount",
          s.presentation_count as "presentationCount",
          s.last_activity_at as "lastActivityAt",
          s.created_at as "createdAt",
          s.updated_at as "updatedAt"
        from spaces s
        left join space_members sm
          on sm.space_id = s.id
          and sm.user_id = ${owner}
        where s.owner_user_id = ${owner}
          or sm.user_id = ${owner}
        order by s.last_activity_at desc
        limit 50
      `)
      return result as unknown as SpaceSummary[]
    })) as SpaceSummary[]
  } catch (error) {
    if (canUseDevDbFallback(error)) return []
    throw error
  }
}

// ============================================================================
// Brok Discover
// ============================================================================

export type DiscoverCategory =
  | 'ai_apps'
  | 'search'
  | 'code'
  | 'chat'
  | 'presentations'

export type DiscoverItemKind =
  | 'thread'
  | 'project'
  | 'presentation'
  | 'prompt'
  | 'api_session'

export type DiscoverPublicItem = {
  id: string
  kind: DiscoverItemKind
  category: DiscoverCategory
  title: string
  summary: string | null
  authorName: string | null
  authorHandle: string | null
  href: string
  thumbnailUrl: string | null
  likeCount: number
  saveCount: number
  shareCount: number
  viewCount: number
  isFeatured: boolean
  publishedAt: Date
}

export type TrendingTopic = {
  id: string
  label: string
  category: DiscoverCategory
  velocity: number
  window: '24h' | '7d'
  rank: number
}

export type DiscoverFeedData = {
  featured: DiscoverPublicItem[]
  trending: TrendingTopic[]
  byCategory: Record<
    DiscoverCategory,
    { label: string; items: DiscoverPublicItem[] }
  >
  totals: {
    items: number
    likes: number
    saves: number
  }
}

const DISCOVER_CATEGORY_LABELS: Record<DiscoverCategory, string> = {
  ai_apps: 'AI apps',
  search: 'Search',
  code: 'Code',
  chat: 'Chat',
  presentations: 'Presentations'
}

const DISCOVER_CATEGORY_ORDER: DiscoverCategory[] = [
  'ai_apps',
  'search',
  'code',
  'chat',
  'presentations'
]

export function getDiscoverCategoryLabel(category: DiscoverCategory) {
  return DISCOVER_CATEGORY_LABELS[category]
}

export function getDiscoverCategoryOrder() {
  return [...DISCOVER_CATEGORY_ORDER]
}

const EMPTY_DISCOVER_TOTALS: DiscoverFeedData['totals'] = {
  items: 0,
  likes: 0,
  saves: 0
}

function emptyDiscoverFeedData(): DiscoverFeedData {
  return {
    featured: [],
    trending: [],
    byCategory: DISCOVER_CATEGORY_ORDER.reduce(
      (acc, category) => {
        acc[category] = { label: DISCOVER_CATEGORY_LABELS[category], items: [] }
        return acc
      },
      {} as Record<
        DiscoverCategory,
        { label: string; items: DiscoverPublicItem[] }
      >
    ),
    totals: { ...EMPTY_DISCOVER_TOTALS }
  }
}

async function getDiscoverItemsRows(): Promise<DiscoverPublicItem[]> {
  try {
    const result = (await db.execute(sql`
      select
        di.id,
        di.kind,
        di.category,
        di.title,
        di.summary,
        di.author_name as "authorName",
        di.author_handle as "authorHandle",
        di.href,
        di.thumbnail_url as "thumbnailUrl",
        di.like_count as "likeCount",
        di.save_count as "saveCount",
        di.share_count as "shareCount",
        di.view_count as "viewCount",
        di.is_featured as "isFeatured",
        di.published_at as "publishedAt"
      from discover_items di
      order by di.published_at desc
      limit 80
    `)) as unknown as DiscoverPublicItem[]
    return result
  } catch (error) {
    if (canUseDevDbFallback(error)) return []
    throw error
  }
}

async function getTrendingTopicRows(): Promise<TrendingTopic[]> {
  try {
    const result = (await db.execute(sql`
      select
        id,
        label,
        category,
        velocity,
        "window",
        rank
      from trending_topics
      where "window" = '24h'
      order by rank asc
      limit 24
    `)) as unknown as TrendingTopic[]
    return result
  } catch (error) {
    if (canUseDevDbFallback(error)) return []
    throw error
  }
}

export async function getDiscoverFeedData(): Promise<DiscoverFeedData> {
  const [items, trending] = await Promise.all([
    getDiscoverItemsRows(),
    getTrendingTopicRows()
  ])

  const byCategory = DISCOVER_CATEGORY_ORDER.reduce<
    Record<DiscoverCategory, { label: string; items: DiscoverPublicItem[] }>
  >(
    (acc, category) => {
      acc[category] = {
        label: DISCOVER_CATEGORY_LABELS[category],
        items: items.filter(item => item.category === category).slice(0, 6)
      }
      return acc
    },
    {} as Record<
      DiscoverCategory,
      { label: string; items: DiscoverPublicItem[] }
    >
  )

  const featured = items.filter(item => item.isFeatured).slice(0, 4)

  return {
    featured,
    trending,
    byCategory,
    totals: {
      items: items.length,
      likes: items.reduce((sum, item) => sum + item.likeCount, 0),
      saves: items.reduce((sum, item) => sum + item.saveCount, 0)
    }
  }
}
