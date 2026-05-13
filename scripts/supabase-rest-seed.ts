import { randomUUID } from 'node:crypto'

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

type PresentationRow = {
  id: string
  title: string
  user_id: string
  description: string | null
  theme_id: string | null
  language: string
  style: string | null
  slide_count: number
  is_public: boolean
}

type PresentationSlideRow = {
  id: string
  presentation_id: string
  slide_index: number
  title: string
  layout_type: string
  content_json: Record<string, any>
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

async function supabaseRest<T>(
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

export async function createPresentationFlowViaSupabaseRest(input: {
  userId: string
}) {
  const [presentation] = await supabaseRest<PresentationRow[]>(
    'presentations',
    {
      method: 'POST',
      body: JSON.stringify({
        title: 'Stress Test Deck',
        user_id: input.userId,
        description: 'Stress verification deck',
        language: 'en',
        style: 'professional',
        slide_count: 2,
        theme_id: 'minimal_light',
        status: 'ready'
      })
    }
  )

  await supabaseRest('presentation_outlines', {
    method: 'POST',
    body: JSON.stringify({
      presentation_id: presentation.id,
      outline_json: [
        {
          title: 'Intro',
          bullets: ['Point A', 'Point B']
        },
        {
          title: 'Next Steps',
          bullets: ['Point C', 'Point D']
        }
      ],
      status: 'ready'
    })
  })

  const slides = await supabaseRest<PresentationSlideRow[]>(
    'presentation_slides',
    {
      method: 'POST',
      body: JSON.stringify([
        {
          presentation_id: presentation.id,
          slide_index: 0,
          title: 'Intro',
          layout_type: 'title',
          content_json: {
            bullets: ['Point A', 'Point B'],
            subtitle: 'Smoke verification'
          }
        },
        {
          presentation_id: presentation.id,
          slide_index: 1,
          title: 'Next Steps',
          layout_type: 'text',
          content_json: {
            bullets: ['Point C', 'Point D']
          }
        }
      ])
    }
  )

  const shareId = `shr_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`
  await supabaseRest(`presentations?id=eq.${presentation.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      is_public: true,
      share_id: shareId,
      updated_at: new Date().toISOString()
    })
  })

  return {
    presentation: {
      id: presentation.id,
      title: presentation.title
    },
    slides: slides.map(slide => ({
      id: slide.id,
      title: slide.title,
      slideIndex: slide.slide_index,
      layoutType: slide.layout_type,
      contentJson: slide.content_json
    })),
    share: {
      shareId,
      shareUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/presentations/${presentation.id}/present`
    }
  }
}
