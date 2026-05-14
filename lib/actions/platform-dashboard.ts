import { sql } from 'drizzle-orm'

import { ensureWorkspaceForUser } from '@/lib/actions/api-keys'
import { getCurrentUserId } from '@/lib/auth/get-current-user'
import { db } from '@/lib/db'
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

type TaskRow = {
  id: string
  chatId: string | null
  kind: string
  status: string
  title: string
  createdAt: Date
  updatedAt: Date
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
  activeTasks: TaskRow[]
  totals: {
    threads: number
    sources: number
    files: number
    publicThreads: number
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
        id,
        chat_id as "chatId",
        kind,
        status,
        title,
        created_at as "createdAt",
        updated_at as "updatedAt"
      from background_tasks
      where user_id = ${userId}
      order by created_at desc
      limit 30
    `)

    return rows as unknown as TaskRow[]
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

function summarizeSources(rows: SourceRow[]) {
  const byDomain = new Map<string, SourceSummary>()

  for (const row of rows) {
    if (!row.url) continue
    const domain = getDomain(row.url)
    const existing = byDomain.get(domain)

    if (!existing) {
      byDomain.set(domain, {
        domain,
        count: 1,
        latestTitle: row.title || domain,
        latestUrl: row.url,
        latestChatId: row.chatId,
        latestChatTitle: row.chatTitle
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
      activeTasks: [],
      totals: {
        threads: 0,
        sources: 0,
        files: 0,
        publicThreads: 0,
        activeTasks: 0
      }
    }
  }

  const [threadRows, sourceRows, taskRows] = await Promise.all([
    getThreadRows(userId),
    getSourceRows(userId),
    getTaskRows(userId)
  ])

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
  const sourceDomains = summarizeSources(sourceRows)
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
      taskCount: taskRows.filter(task => inferSpace(task.title).id === rule.id)
        .length,
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
    activeTasks,
    totals: {
      threads: threads.length,
      sources: threads.reduce((sum, thread) => sum + thread.sourceCount, 0),
      files: threads.reduce((sum, thread) => sum + thread.fileCount, 0),
      publicThreads: threads.filter(thread => thread.visibility === 'public')
        .length,
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
  const usageColumns = await getUsageEventColumns()
  const surfaceColumn = usageColumns.has('surface')
    ? sql`ue.surface`
    : sql`'api'::text`
  const runtimeColumn = usageColumns.has('runtime')
    ? sql`ue.runtime`
    : sql`null::text`

  const [keys, recentEvents, dailyRows, endpointRows, keyRows] =
    await Promise.all([
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
    ])

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
