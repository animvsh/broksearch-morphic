export type InsForgeTrialProject = {
  accessApiKey: string
  projectId: string | null
  appkey: string | null
  region: string | null
  projectUrl: string
  dashboardUrl: string | null
  claimUrl: string | null
  trialExpiresAt: string | null
}

export type SharedInsForgeRailwayConfig = {
  accessApiKey: string
  projectUrl: string
  dashboardUrl: string | null
  projectId: string | null
  appkey: string | null
  region: string | null
}

export type InsForgeProjectHealthStatus =
  | 'online'
  | 'offline'
  | 'auth_error'
  | 'not_found'
  | 'expired_or_limited'
  | 'error'

export type InsForgeProjectHealthResult = {
  health: InsForgeProjectHealthStatus
  statusCode: number | null
  checkedUrl: string | null
  error: string | null
}

export type InsForgeBackendContext = {
  projectUrl: string
  database: {
    totalTables: number | null
    totalRecords: number | null
    databaseSize: string | null
    tables: Array<{
      name: string
      recordCount: number | null
      columns: Array<{
        name: string
        type: string
        nullable: boolean | null
        primaryKey: boolean | null
      }>
    }>
  }
  storageBuckets: string[]
  functions: Array<{
    slug: string
    name: string
    status: string
    description: string | null
  }>
  errors: string[]
}

function stringOrNull(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function requiredString(value: unknown, name: string) {
  const text = stringOrNull(value)
  if (!text) {
    throw new Error(`InsForge did not return ${name}.`)
  }
  return text
}

export function getSharedInsForgeRailwayConfig(): SharedInsForgeRailwayConfig | null {
  const projectUrl =
    stringOrNull(process.env.BROKCODE_INSFORGE_SHARED_URL) ??
    stringOrNull(process.env.INSFORGE_PROJECT_URL)
  const accessApiKey =
    stringOrNull(process.env.BROKCODE_INSFORGE_SHARED_ADMIN_KEY) ??
    stringOrNull(process.env.INSFORGE_ACCESS_API_KEY)

  if (!projectUrl || !accessApiKey) return null

  return {
    projectUrl,
    accessApiKey,
    dashboardUrl:
      stringOrNull(process.env.BROKCODE_INSFORGE_SHARED_DASHBOARD_URL) ??
      stringOrNull(process.env.INSFORGE_DASHBOARD_URL),
    projectId:
      stringOrNull(process.env.BROKCODE_INSFORGE_SHARED_PROJECT_ID) ??
      stringOrNull(process.env.INSFORGE_PROJECT_ID),
    appkey:
      stringOrNull(process.env.BROKCODE_INSFORGE_SHARED_APP_KEY) ??
      stringOrNull(process.env.INSFORGE_APP_KEY),
    region:
      stringOrNull(process.env.BROKCODE_INSFORGE_SHARED_REGION) ??
      stringOrNull(process.env.INSFORGE_REGION)
  }
}

export async function createInsForgeTrialProject(projectName: string) {
  const response = await fetch('https://api.insforge.dev/agents/v1/signup', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ projectName }),
    cache: 'no-store'
  })
  const body = await response.json().catch(() => null)

  if (!response.ok) {
    const message =
      typeof body?.message === 'string'
        ? body.message
        : typeof body?.error === 'string'
          ? body.error
          : 'InsForge trial project creation failed.'
    throw new Error(message)
  }

  return {
    accessApiKey: requiredString(body?.accessApiKey, 'accessApiKey'),
    projectId: stringOrNull(body?.projectId),
    appkey: stringOrNull(body?.appkey),
    region: stringOrNull(body?.region),
    projectUrl: requiredString(body?.projectUrl, 'projectUrl'),
    dashboardUrl: stringOrNull(body?.dashboardUrl),
    claimUrl: stringOrNull(body?.claimUrl),
    trialExpiresAt: stringOrNull(body?.trialExpiresAt)
  } satisfies InsForgeTrialProject
}

function resolveHealthUrl(projectUrl: string) {
  const parsed = new URL(projectUrl)
  parsed.pathname = '/api/health'
  parsed.search = ''
  parsed.hash = ''
  return parsed.toString()
}

function classifyHealthResponse(status: number): InsForgeProjectHealthStatus {
  if (status >= 200 && status < 300) return 'online'
  if (status === 401 || status === 403) return 'auth_error'
  if (status === 404) return 'not_found'
  if (status === 402 || status === 410 || status === 429 || status === 451) {
    return 'expired_or_limited'
  }
  if (status >= 500) return 'offline'
  return 'error'
}

function summarizeHealthStatus(
  health: InsForgeProjectHealthStatus,
  statusCode: number
) {
  if (health === 'online') return null
  if (health === 'auth_error') {
    return 'InsForge rejected the health request. Check the project URL and admin key.'
  }
  if (health === 'not_found') {
    return 'InsForge health endpoint was not found for this project URL.'
  }
  if (health === 'expired_or_limited') {
    return 'InsForge project appears expired, limited, or over quota.'
  }
  if (health === 'offline') {
    return 'InsForge project is not responding successfully right now.'
  }
  return `InsForge health check returned HTTP ${statusCode}.`
}

function buildProjectApiUrl(projectUrl: string, pathname: string) {
  const parsed = new URL(projectUrl)
  parsed.pathname = pathname
  parsed.search = ''
  parsed.hash = ''
  return parsed.toString()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function getString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function getNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

async function fetchInsForgeJson({
  projectUrl,
  pathname,
  adminKey,
  timeoutMs = 8000
}: {
  projectUrl: string
  pathname: string
  adminKey: string
  timeoutMs?: number
}) {
  const url = buildProjectApiUrl(projectUrl, pathname)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${adminKey}`,
        'X-API-Key': adminKey,
        'x-api-key': adminKey
      },
      signal: controller.signal,
      cache: 'no-store'
    })
    const contentType = response.headers.get('content-type') ?? ''

    if (!response.ok) {
      throw new Error(`${pathname} returned HTTP ${response.status}`)
    }

    if (!contentType.includes('application/json')) {
      throw new Error(`${pathname} did not return JSON`)
    }

    return response.json() as Promise<unknown>
  } finally {
    clearTimeout(timer)
  }
}

function normalizeTableNames(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string')
  }

  if (isRecord(value) && Array.isArray(value.tables)) {
    return value.tables
      .map(table =>
        typeof table === 'string'
          ? table
          : isRecord(table)
            ? getString(table.name)
            : ''
      )
      .filter(Boolean)
  }

  return []
}

function normalizeDatabaseTableStats(value: unknown) {
  if (!isRecord(value)) return new Map<string, number | null>()
  const stats = new Map<string, number | null>()
  const tables = Array.isArray(value.tables) ? value.tables : []

  for (const table of tables) {
    if (!isRecord(table)) continue
    const name = getString(table.name)
    if (!name) continue
    stats.set(name, getNumber(table.recordCount))
  }

  return stats
}

function normalizeTableSchema(value: unknown) {
  if (!isRecord(value)) return []
  const columns = Array.isArray(value.columns) ? value.columns : []

  return columns
    .filter(isRecord)
    .map(column => ({
      name: getString(column.name),
      type: getString(column.type),
      nullable: typeof column.nullable === 'boolean' ? column.nullable : null,
      primaryKey:
        typeof column.isPrimaryKey === 'boolean' ? column.isPrimaryKey : null
    }))
    .filter(column => column.name)
    .slice(0, 24)
}

function normalizeBuckets(value: unknown) {
  if (isRecord(value) && Array.isArray(value.buckets)) {
    return value.buckets
      .filter((bucket): bucket is string => typeof bucket === 'string')
      .slice(0, 20)
  }
  return []
}

function normalizeFunctions(value: unknown) {
  if (!Array.isArray(value)) return []

  return value
    .filter(isRecord)
    .map(fn => ({
      slug: getString(fn.slug),
      name: getString(fn.name),
      status: getString(fn.status),
      description: getString(fn.description) || null
    }))
    .filter(fn => fn.slug || fn.name)
    .slice(0, 20)
}

async function classifySuccessfulHealthResponse(response: Response) {
  const contentType = response.headers.get('content-type') ?? ''
  const body = await response.text().catch(() => '')
  const trimmedBody = body.trim()

  if (contentType.includes('text/html')) return 'error'
  if (!trimmedBody) return 'online'
  if (/^(ok|healthy)$/i.test(trimmedBody)) return 'online'

  if (contentType.includes('application/json')) {
    try {
      const parsed = JSON.parse(trimmedBody) as Record<string, unknown>
      const status =
        typeof parsed.status === 'string' ? parsed.status.toLowerCase() : null
      const health =
        typeof parsed.health === 'string' ? parsed.health.toLowerCase() : null
      const ok = typeof parsed.ok === 'boolean' ? parsed.ok : null
      const healthy =
        typeof parsed.healthy === 'boolean' ? parsed.healthy : null

      if (ok === false || healthy === false) return 'error'
      if (ok === true || healthy === true) return 'online'
      if (status === 'ok' || status === 'healthy' || health === 'ok') {
        return 'online'
      }
      if (
        status === 'error' ||
        status === 'unhealthy' ||
        health === 'error' ||
        health === 'unhealthy'
      ) {
        return 'error'
      }
    } catch {
      return 'error'
    }
  }

  return 'online'
}

export async function checkInsForgeProjectHealth({
  projectUrl,
  adminKey,
  timeoutMs = 8000
}: {
  projectUrl: string
  adminKey?: string | null
  timeoutMs?: number
}): Promise<InsForgeProjectHealthResult> {
  let checkedUrl: string

  try {
    checkedUrl = resolveHealthUrl(projectUrl)
  } catch {
    return {
      health: 'error',
      statusCode: null,
      checkedUrl: null,
      error: 'InsForge project URL is invalid.'
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(checkedUrl, {
      method: 'GET',
      headers: adminKey
        ? {
            Authorization: `Bearer ${adminKey}`,
            'x-api-key': adminKey
          }
        : undefined,
      signal: controller.signal,
      cache: 'no-store'
    })
    const health =
      response.ok && response.status >= 200 && response.status < 300
        ? await classifySuccessfulHealthResponse(response)
        : classifyHealthResponse(response.status)

    return {
      health,
      statusCode: response.status,
      checkedUrl,
      error: summarizeHealthStatus(health, response.status)
    }
  } catch (error) {
    return {
      health:
        error instanceof Error && error.name === 'AbortError'
          ? 'offline'
          : 'error',
      statusCode: null,
      checkedUrl,
      error:
        error instanceof Error ? error.message : 'InsForge health check failed.'
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchInsForgeBackendContext({
  projectUrl,
  adminKey,
  tableLimit = 8
}: {
  projectUrl: string
  adminKey: string | null
  tableLimit?: number
}): Promise<InsForgeBackendContext | null> {
  if (!adminKey) return null

  const errors: string[] = []
  const context: InsForgeBackendContext = {
    projectUrl,
    database: {
      totalTables: null,
      totalRecords: null,
      databaseSize: null,
      tables: []
    },
    storageBuckets: [],
    functions: [],
    errors
  }

  const [databaseResult, tablesResult, bucketsResult, functionsResult] =
    await Promise.allSettled([
      fetchInsForgeJson({
        projectUrl,
        pathname: '/api/metadata/database',
        adminKey
      }),
      fetchInsForgeJson({
        projectUrl,
        pathname: '/api/database/tables',
        adminKey
      }),
      fetchInsForgeJson({
        projectUrl,
        pathname: '/api/storage/buckets',
        adminKey
      }),
      fetchInsForgeJson({
        projectUrl,
        pathname: '/api/functions',
        adminKey
      })
    ])

  if (databaseResult.status === 'fulfilled' && isRecord(databaseResult.value)) {
    context.database.totalTables = getNumber(databaseResult.value.totalTables)
    context.database.totalRecords = getNumber(databaseResult.value.totalRecords)
    context.database.databaseSize =
      getString(databaseResult.value.databaseSize) || null
  } else if (databaseResult.status === 'rejected') {
    errors.push(databaseResult.reason?.message ?? 'Database metadata failed')
  }

  const tableStats =
    databaseResult.status === 'fulfilled'
      ? normalizeDatabaseTableStats(databaseResult.value)
      : new Map<string, number | null>()
  const tableNames =
    tablesResult.status === 'fulfilled'
      ? normalizeTableNames(tablesResult.value).slice(0, tableLimit)
      : []

  if (tablesResult.status === 'rejected') {
    errors.push(tablesResult.reason?.message ?? 'Table listing failed')
  }

  const tableSchemas = await Promise.allSettled(
    tableNames.map(async name => ({
      name,
      schema: await fetchInsForgeJson({
        projectUrl,
        pathname: `/api/database/tables/${encodeURIComponent(name)}/schema`,
        adminKey
      })
    }))
  )

  context.database.tables = tableSchemas
    .filter(
      (
        result
      ): result is PromiseFulfilledResult<{ name: string; schema: unknown }> =>
        result.status === 'fulfilled'
    )
    .map(result => ({
      name: result.value.name,
      recordCount: tableStats.get(result.value.name) ?? null,
      columns: normalizeTableSchema(result.value.schema)
    }))

  for (const result of tableSchemas) {
    if (result.status === 'rejected') {
      errors.push(result.reason?.message ?? 'Table schema fetch failed')
    }
  }

  if (bucketsResult.status === 'fulfilled') {
    context.storageBuckets = normalizeBuckets(bucketsResult.value)
  } else {
    errors.push(bucketsResult.reason?.message ?? 'Bucket listing failed')
  }

  if (functionsResult.status === 'fulfilled') {
    context.functions = normalizeFunctions(functionsResult.value)
  } else {
    errors.push(functionsResult.reason?.message ?? 'Function listing failed')
  }

  return context
}

export function formatInsForgeBackendContextForPrompt(
  context: InsForgeBackendContext | null
) {
  if (!context) return ''

  const tableLines = context.database.tables.length
    ? context.database.tables.map(table => {
        const columns = table.columns
          .map(column => {
            const flags = [
              column.primaryKey ? 'pk' : null,
              column.nullable === false ? 'required' : null
            ]
              .filter(Boolean)
              .join(',')
            return `${column.name}:${column.type}${flags ? `(${flags})` : ''}`
          })
          .join(', ')
        return `- ${table.name}${table.recordCount === null ? '' : ` (${table.recordCount} records)`}: ${columns || 'schema unavailable'}`
      })
    : ['- No public tables discovered yet.']

  const functionLines = context.functions.length
    ? context.functions.map(
        fn => `- ${fn.slug || fn.name}: ${fn.status || 'unknown'}`
      )
    : ['- No functions discovered yet.']

  const bucketLine = context.storageBuckets.length
    ? context.storageBuckets.join(', ')
    : 'none discovered yet'

  const errorLine = context.errors.length
    ? `\nContext warnings: ${context.errors.slice(0, 4).join(' | ')}`
    : ''

  return [
    'Live InsForge backend context:',
    `Project URL: ${context.projectUrl}`,
    `Database: ${context.database.totalTables ?? context.database.tables.length} tables, ${context.database.totalRecords ?? 'unknown'} records, size ${context.database.databaseSize ?? 'unknown'}.`,
    'Tables:',
    ...tableLines,
    `Storage buckets: ${bucketLine}.`,
    'Functions:',
    ...functionLines,
    'Use these exact resources when generating app code. Do not ask the browser for the InsForge admin key or expose it in generated files.',
    errorLine
  ]
    .filter(Boolean)
    .join('\n')
}
