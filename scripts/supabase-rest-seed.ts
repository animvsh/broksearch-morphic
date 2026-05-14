type WorkspaceRow = {
  id: string
  name: string
  owner_user_id: string
}

type ApiKeyInsert = {
  workspace_id: string
  user_id: string
  name: string
  key_prefix: string
  key_hash: string
  environment: 'test' | 'live'
  scopes: string[]
  allowed_models: string[]
  rpm_limit: number
  daily_request_limit: number
  monthly_budget_cents: number
}

type ApiKeyRow = ApiKeyInsert & {
  id: string
  status: 'active' | 'paused' | 'revoked'
}

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for Supabase REST seeding.'
    )
  }

  return { url, serviceRoleKey }
}

export async function supabaseRest<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const { url, serviceRoleKey } = getSupabaseConfig()
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...init.headers
    }
  })

  const text = await response.text()
  const body = text ? JSON.parse(text) : null

  if (!response.ok) {
    throw new Error(
      `Supabase REST ${path} failed with ${response.status}: ${text}`
    )
  }

  return body as T
}

export async function ensureWorkspaceForUserViaSupabaseRest(userId: string) {
  const existing = await supabaseRest<WorkspaceRow[]>(
    `workspaces?select=*&owner_user_id=eq.${encodeURIComponent(userId)}&order=created_at.asc&limit=1`
  )

  if (existing[0]) {
    return {
      id: existing[0].id,
      name: existing[0].name,
      ownerUserId: existing[0].owner_user_id
    }
  }

  const [created] = await supabaseRest<WorkspaceRow[]>('workspaces', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Personal Workspace',
      owner_user_id: userId
    })
  })

  return {
    id: created.id,
    name: created.name,
    ownerUserId: created.owner_user_id
  }
}

export async function createApiKeyViaSupabaseRest(input: ApiKeyInsert) {
  const [created] = await supabaseRest<ApiKeyRow[]>('api_keys', {
    method: 'POST',
    body: JSON.stringify(input)
  })

  return {
    id: created.id,
    workspaceId: created.workspace_id,
    userId: created.user_id,
    name: created.name,
    status: created.status
  }
}

export async function updateApiKeyStatusViaSupabaseRest(
  id: string,
  status: 'paused' | 'revoked'
) {
  await supabaseRest(`api_keys?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      status,
      revoked_at: status === 'revoked' ? new Date().toISOString() : null
    })
  })
}

export async function createUsageEventViaSupabaseRest(input: {
  request_id: string
  workspace_id: string
  user_id: string
  api_key_id: string
  endpoint: 'chat' | 'search' | 'code' | 'agents'
  model: string
  provider: string
  input_tokens: number
  output_tokens: number
  provider_cost_usd: string
  billed_usd: string
  latency_ms: number
  status: string
}) {
  await supabaseRest('usage_events', {
    method: 'POST',
    body: JSON.stringify(input)
  })
}
