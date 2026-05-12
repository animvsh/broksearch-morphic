type ComposioRequestOptions = {
  method?: 'GET' | 'POST'
  query?: URLSearchParams
  body?: Record<string, unknown>
}

type ComposioToolExecuteParams = {
  toolSlug: string
  userId: string
  text?: string
  arguments?: Record<string, unknown>
  connectedAccountId?: string
}

type ComposioConnectedAccount = {
  id?: string
  status?: string
  toolkit?: string
  toolkit_slug?: string
  appName?: string
  appUniqueId?: string
  auth_config_id?: string
}

type ComposioAuthConfig = {
  id?: string
  toolkit_slug?: string
  appName?: string
  status?: string
}

type ComposioMcpJsonRpcResponse = {
  id?: number | string | null
  jsonrpc?: string
  result?: Record<string, unknown>
  error?: {
    code?: number
    message?: string
  }
}

type ComposioConnectToolkitAction = 'add' | 'rename' | 'list' | 'remove'

const DEFAULT_COMPOSIO_BASE_URL = 'https://backend.composio.dev'
const DEFAULT_COMPOSIO_CONNECT_MCP_URL = 'https://connect.composio.dev/mcp'
const DEFAULT_CONNECT_TOOLKITS = [
  'googlesuper',
  'linear',
  'github',
  'gmail',
  'googlecalendar',
  'slack'
]
const CONNECT_KEY_PREFIX = 'ck_'

function resolveBaseUrl() {
  const baseUrl =
    process.env.COMPOSIO_BASE_URL?.trim() || DEFAULT_COMPOSIO_BASE_URL
  return baseUrl.replace(/\/+$/, '')
}

function resolveApiVersion() {
  return process.env.COMPOSIO_API_VERSION?.trim() || 'v3.1'
}

function resolveBackendApiKey() {
  const key = process.env.COMPOSIO_API_KEY?.trim() || ''
  return key.startsWith(CONNECT_KEY_PREFIX) ? '' : key
}

function resolveConnectApiKey() {
  const connectKey = process.env.COMPOSIO_CONNECT_KEY?.trim()
  if (connectKey) return connectKey

  const legacyApiKey = process.env.COMPOSIO_API_KEY?.trim() || ''
  return legacyApiKey.startsWith(CONNECT_KEY_PREFIX) ? legacyApiKey : ''
}

function resolveConnectMcpUrl() {
  return (
    process.env.COMPOSIO_CONNECT_MCP_URL?.trim() ||
    process.env.COMPOSIO_MCP_URL?.trim() ||
    DEFAULT_COMPOSIO_CONNECT_MCP_URL
  )
}

function resolveConnectToolkits() {
  const raw =
    process.env.COMPOSIO_CONNECT_TOOLKITS?.trim() ||
    process.env.COMPOSIO_TOOLKITS?.trim() ||
    DEFAULT_CONNECT_TOOLKITS.join(',')

  const unique = new Set(
    raw
      .split(',')
      .map(value => value.trim().toLowerCase())
      .filter(Boolean)
  )

  return [...unique]
}

function formatToolkitName(slug: string) {
  return slug
    .split(/[-_]/g)
    .filter(Boolean)
    .map(part => part[0]?.toUpperCase() + part.slice(1))
    .join(' ')
}

function sanitizeConnectSessionSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
}

function buildConnectSessionId(userId?: string, toolkitSlug?: string) {
  if (!userId) return undefined

  const userSegment = sanitizeConnectSessionSegment(userId)
  const toolkitSegment = toolkitSlug
    ? sanitizeConnectSessionSegment(toolkitSlug)
    : 'all'

  if (!userSegment) return undefined
  return `brok_${userSegment}_${toolkitSegment}`
}

function buildUrl(path: string, query?: URLSearchParams) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const version = resolveApiVersion().replace(/^\/+/, '')
  const url = new URL(`${resolveBaseUrl()}/api/${version}${normalizedPath}`)
  if (query) {
    url.search = query.toString()
  }
  return url.toString()
}

function extractArrayPayload(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === 'object'
    )
  }

  if (payload && typeof payload === 'object') {
    const data = payload as Record<string, unknown>
    const candidates = [data.items, data.data, data.results]

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate.filter(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === 'object'
        )
      }

      if (
        candidate &&
        typeof candidate === 'object' &&
        Array.isArray((candidate as Record<string, unknown>).items)
      ) {
        return (
          (candidate as Record<string, unknown>).items as unknown[]
        ).filter(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === 'object'
        )
      }
    }
  }

  return []
}

function safeJsonParse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function parseMcpResponseBody(rawBody: string): ComposioMcpJsonRpcResponse {
  const dataLines = rawBody
    .split(/\r?\n/g)
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice(5).trim())
    .filter(Boolean)

  const candidates = dataLines.length > 0 ? dataLines : [rawBody.trim()]

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const parsed = safeJsonParse<ComposioMcpJsonRpcResponse>(candidates[index]!)
    if (parsed && typeof parsed === 'object') {
      return parsed
    }
  }

  throw new Error('Composio Connect MCP returned an unreadable response')
}

async function composioConnectMcpRequest(
  method: string,
  params?: Record<string, unknown>
) {
  const apiKey = resolveConnectApiKey()
  if (!apiKey) {
    throw new Error('COMPOSIO_CONNECT_KEY is not configured')
  }

  const response = await fetch(resolveConnectMcpUrl(), {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      'x-consumer-api-key': apiKey
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      ...(params ? { params } : {})
    })
  })

  const rawBody = await response.text()
  const parsed = parseMcpResponseBody(rawBody)
  const errorMessage =
    parsed.error?.message ||
    (!response.ok ? `HTTP ${response.status}` : 'Unknown error')

  if (!response.ok || parsed.error) {
    throw new Error(`Composio Connect MCP request failed: ${errorMessage}`)
  }

  return parsed.result || {}
}

async function composioManageConnectionsConnect(params: {
  toolkits: Array<{
    name: string
    action?: ComposioConnectToolkitAction
  }>
  sessionId?: string
}) {
  const args: Record<string, unknown> = { toolkits: params.toolkits }
  if (params.sessionId) {
    args.session_id = params.sessionId
  }

  const result = await composioConnectMcpRequest('tools/call', {
    name: 'COMPOSIO_MANAGE_CONNECTIONS',
    arguments: args
  })

  const content = Array.isArray(result.content)
    ? result.content.find(
        item =>
          item &&
          typeof item === 'object' &&
          (item as Record<string, unknown>).type === 'text' &&
          typeof (item as Record<string, unknown>).text === 'string'
      )
    : null

  const textPayload =
    content &&
    typeof content === 'object' &&
    typeof (content as Record<string, unknown>).text === 'string'
      ? ((content as Record<string, unknown>).text as string)
      : ''

  const parsedToolPayload =
    safeJsonParse<Record<string, unknown>>(textPayload) || result
  return parsedToolPayload
}

function extractToolkitResultsFromConnect(payload: Record<string, unknown>) {
  const data =
    payload.data && typeof payload.data === 'object'
      ? (payload.data as Record<string, unknown>)
      : null
  const results =
    data?.results && typeof data.results === 'object'
      ? (data.results as Record<string, unknown>)
      : null

  return results || {}
}

function normalizeConnectedAccountsFromConnect(
  payload: Record<string, unknown>
): ComposioConnectedAccount[] {
  const toolkitResults = extractToolkitResultsFromConnect(payload)
  const accounts: ComposioConnectedAccount[] = []

  for (const [toolkitSlug, rawToolkitResult] of Object.entries(
    toolkitResults
  )) {
    if (!rawToolkitResult || typeof rawToolkitResult !== 'object') continue

    const toolkitResult = rawToolkitResult as Record<string, unknown>
    const rawAccounts = Array.isArray(toolkitResult.accounts)
      ? toolkitResult.accounts
      : []

    for (const rawAccount of rawAccounts) {
      if (!rawAccount || typeof rawAccount !== 'object') continue
      const account = rawAccount as Record<string, unknown>

      accounts.push({
        id: typeof account.id === 'string' ? account.id : undefined,
        status: typeof account.status === 'string' ? account.status : undefined,
        toolkit: toolkitSlug,
        toolkit_slug: toolkitSlug,
        appName: formatToolkitName(toolkitSlug)
      })
    }
  }

  return accounts
}

function inferToolkitFromAuthConfigId(authConfigId?: string) {
  if (!authConfigId) return undefined
  if (authConfigId.startsWith('connect-')) {
    return authConfigId.slice('connect-'.length)
  }
  return undefined
}

function resolveToolkitEnvKeys(toolkitSlug?: string) {
  if (!toolkitSlug) return []

  const upper = toolkitSlug
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()

  const keys = [`COMPOSIO_${upper}_AUTH_CONFIG_ID`]

  if (toolkitSlug.toLowerCase() === 'googlesuper') {
    keys.push('COMPOSIO_GOOGLE_SUPER_AUTH_CONFIG_ID')
  }

  return [...new Set(keys)]
}

function authConfigMatchesToolkit(
  config: ComposioAuthConfig,
  toolkitSlug?: string
) {
  if (!config.id) return false
  if (!toolkitSlug) return true

  return config.toolkit_slug === toolkitSlug
}

function isEnabledAuthConfig(config: ComposioAuthConfig) {
  const status = config.status?.toLowerCase()
  return !status || ['active', 'connected', 'enabled'].includes(status)
}

async function getAuthConfigById(
  authConfigId: string,
  toolkitSlug?: string
): Promise<ComposioAuthConfig | null> {
  if (isComposioConnectMode()) {
    return {
      id: authConfigId,
      toolkit_slug: inferToolkitFromAuthConfigId(authConfigId) || toolkitSlug,
      status: 'ENABLED'
    }
  }

  try {
    const payload = await composioRequest(
      `/auth_configs/${encodeURIComponent(authConfigId)}`
    )
    const data =
      payload &&
      typeof payload === 'object' &&
      (payload as Record<string, unknown>).data &&
      typeof (payload as Record<string, unknown>).data === 'object'
        ? ((payload as Record<string, unknown>).data as Record<string, unknown>)
        : payload && typeof payload === 'object'
          ? (payload as Record<string, unknown>)
          : null

    if (!data) return null

    const config: ComposioAuthConfig = {
      id: typeof data.id === 'string' ? data.id : undefined,
      toolkit_slug:
        typeof data.toolkit_slug === 'string'
          ? data.toolkit_slug
          : typeof data.toolkit === 'string'
            ? data.toolkit
            : undefined,
      appName: typeof data.appName === 'string' ? data.appName : undefined,
      status: typeof data.status === 'string' ? data.status : undefined
    }

    return authConfigMatchesToolkit(config, toolkitSlug) &&
      isEnabledAuthConfig(config)
      ? config
      : null
  } catch {
    return null
  }
}

async function resolveBackendAuthConfigId(
  authConfigId?: string,
  toolkitSlug?: string
) {
  if (authConfigId) {
    const config = await getAuthConfigById(authConfigId, toolkitSlug)
    if (config?.id) return config.id
  }

  for (const key of resolveToolkitEnvKeys(toolkitSlug)) {
    const value = process.env[key]?.trim()
    if (!value) continue

    const config = await getAuthConfigById(value, toolkitSlug)
    if (config?.id) return config.id
  }

  const fallback = process.env.COMPOSIO_AUTH_CONFIG_ID?.trim()
  if (fallback) {
    const config = await getAuthConfigById(fallback, toolkitSlug)
    if (config?.id) return config.id
  }

  const authConfigs = await listAuthConfigs(toolkitSlug)
  const matchingConfig = authConfigs.find(config =>
    toolkitSlug
      ? config.toolkit_slug === toolkitSlug && isEnabledAuthConfig(config)
      : isEnabledAuthConfig(config)
  )

  return matchingConfig?.id
}

async function composioRequest(
  path: string,
  options: ComposioRequestOptions = {}
) {
  const apiKey = resolveBackendApiKey()
  if (!apiKey) {
    if (resolveConnectApiKey()) {
      throw new Error(
        'COMPOSIO_API_KEY is not a backend key. Use COMPOSIO_CONNECT_KEY (ck_...) with connect-compatible Composio flows.'
      )
    }
    throw new Error('COMPOSIO_API_KEY is not configured')
  }

  const response = await fetch(buildUrl(path, options.query), {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'x-api-key': apiKey
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {})
  })

  const text = await response.text()
  let payload: unknown = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = text
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object'
        ? String((payload as Record<string, unknown>).message || text || '')
        : String(text || '')

    throw new Error(
      `Composio request failed (${response.status}): ${message || 'Unknown error'}`
    )
  }

  return payload
}

export function isComposioConnectMode() {
  if (process.env.COMPOSIO_FORCE_CONNECT_MODE === 'true') {
    return Boolean(resolveConnectApiKey())
  }

  return Boolean(resolveConnectApiKey() && !resolveBackendApiKey())
}

export function isComposioConfigured() {
  return Boolean(resolveBackendApiKey() || resolveConnectApiKey())
}

export async function listConnectedAccounts(
  userId?: string,
  toolkitSlug?: string,
  limit: number = 20
): Promise<ComposioConnectedAccount[]> {
  if (isComposioConnectMode()) {
    const toolkits = toolkitSlug ? [toolkitSlug] : resolveConnectToolkits()
    const settled = await Promise.allSettled(
      toolkits.map(async slug => {
        const payload = await composioManageConnectionsConnect({
          toolkits: [{ name: slug, action: 'list' }],
          sessionId: buildConnectSessionId(userId, slug)
        })
        return normalizeConnectedAccountsFromConnect(payload)
      })
    )

    const combined: ComposioConnectedAccount[] = []
    let firstError: Error | null = null

    for (const item of settled) {
      if (item.status === 'fulfilled') {
        combined.push(...item.value)
      } else if (!firstError) {
        firstError =
          item.reason instanceof Error
            ? item.reason
            : new Error('Failed to query Composio Connect accounts')
      }
    }

    if (combined.length === 0 && firstError) {
      throw firstError
    }

    return combined.slice(0, limit)
  }

  const query = new URLSearchParams()
  query.set('limit', String(limit))
  if (userId) query.append('user_ids', userId)
  if (toolkitSlug) query.append('toolkit_slugs', toolkitSlug)

  const payload = await composioRequest('/connected_accounts', { query })
  const items = extractArrayPayload(payload)

  return items.map(item => ({
    id: typeof item.id === 'string' ? item.id : undefined,
    status: typeof item.status === 'string' ? item.status : undefined,
    toolkit:
      typeof item.toolkit_slug === 'string'
        ? item.toolkit_slug
        : typeof item.toolkit === 'string'
          ? item.toolkit
          : undefined,
    toolkit_slug:
      typeof item.toolkit_slug === 'string' ? item.toolkit_slug : undefined,
    appName: typeof item.appName === 'string' ? item.appName : undefined,
    appUniqueId:
      typeof item.appUniqueId === 'string' ? item.appUniqueId : undefined,
    auth_config_id:
      typeof item.auth_config_id === 'string' ? item.auth_config_id : undefined
  }))
}

export async function listAuthConfigs(
  toolkitSlug?: string
): Promise<ComposioAuthConfig[]> {
  if (isComposioConnectMode()) {
    const toolkits = toolkitSlug ? [toolkitSlug] : resolveConnectToolkits()
    return toolkits.map(slug => ({
      id: `connect-${slug}`,
      toolkit_slug: slug,
      appName: formatToolkitName(slug),
      status: 'ENABLED'
    }))
  }

  const query = new URLSearchParams()
  if (toolkitSlug) query.append('toolkit_slugs', toolkitSlug)

  const payload = await composioRequest('/auth_configs', { query })
  const items = extractArrayPayload(payload)

  return items.map(item => ({
    id: typeof item.id === 'string' ? item.id : undefined,
    toolkit_slug:
      typeof item.toolkit_slug === 'string' ? item.toolkit_slug : undefined,
    appName: typeof item.appName === 'string' ? item.appName : undefined,
    status: typeof item.status === 'string' ? item.status : undefined
  }))
}

function resolveConnectionUrl(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined
  const data = payload as Record<string, unknown>

  const direct =
    data.redirect_url ||
    data.redirectUrl ||
    data.connect_url ||
    data.url ||
    data.link

  if (typeof direct === 'string' && direct.length > 0) return direct

  if (data.data && typeof data.data === 'object') {
    return resolveConnectionUrl(data.data)
  }

  return undefined
}

export async function createConnectedAccountLink(params: {
  authConfigId?: string
  userId: string
  toolkitSlug?: string
  redirectUrl?: string
}) {
  if (isComposioConnectMode()) {
    const toolkitSlug =
      params.toolkitSlug || inferToolkitFromAuthConfigId(params.authConfigId)

    if (!toolkitSlug) {
      throw new Error(
        'toolkitSlug is required for Composio Connect mode. Example: toolkitSlug=\"linear\".'
      )
    }

    const payload = await composioManageConnectionsConnect({
      toolkits: [{ name: toolkitSlug, action: 'add' }],
      sessionId: buildConnectSessionId(params.userId, toolkitSlug)
    })

    const toolkitResults = extractToolkitResultsFromConnect(payload)
    const toolkitPayload =
      toolkitResults[toolkitSlug] &&
      typeof toolkitResults[toolkitSlug] === 'object'
        ? (toolkitResults[toolkitSlug] as Record<string, unknown>)
        : null

    const url = resolveConnectionUrl(toolkitPayload || payload)
    return {
      raw: payload,
      url
    }
  }

  const authConfigId = await resolveBackendAuthConfigId(
    params.authConfigId,
    params.toolkitSlug
  )

  if (!authConfigId) {
    throw new Error(
      params.toolkitSlug
        ? `Could not find a Composio auth config for ${params.toolkitSlug}. Set COMPOSIO_${params.toolkitSlug.toUpperCase()}_AUTH_CONFIG_ID or create an enabled auth config.`
        : 'authConfigId is required for backend Composio mode.'
    )
  }

  const payload = await composioRequest('/connected_accounts/link', {
    method: 'POST',
    body: {
      auth_config_id: authConfigId,
      user_id: params.userId,
      ...(params.toolkitSlug ? { toolkit_slug: params.toolkitSlug } : {}),
      ...(params.redirectUrl
        ? {
            redirect_url: params.redirectUrl,
            callback_url: params.redirectUrl
          }
        : {})
    }
  })

  return {
    raw: payload,
    url: resolveConnectionUrl(payload)
  }
}

export async function executeComposioTool({
  toolSlug,
  userId,
  text,
  arguments: toolArguments,
  connectedAccountId
}: ComposioToolExecuteParams) {
  if (isComposioConnectMode() && !resolveBackendApiKey()) {
    throw new Error(
      'Composio tool execution requires COMPOSIO_API_KEY. COMPOSIO_CONNECT_KEY can create links but cannot run backend actions.'
    )
  }

  if (!text && !toolArguments) {
    throw new Error('Provide text or arguments for Composio tool execution.')
  }

  return composioRequest(`/tools/execute/${toolSlug}`, {
    method: 'POST',
    body: {
      user_id: userId,
      ...(connectedAccountId
        ? { connected_account_id: connectedAccountId }
        : {}),
      ...(text ? { text } : {}),
      ...(toolArguments ? { arguments: toolArguments } : {})
    }
  })
}
