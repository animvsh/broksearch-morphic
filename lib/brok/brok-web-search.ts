import { BROK_PROVIDER_API_KEY, BROK_PROVIDER_BASE_URL } from '@/lib/ai/brok'

export interface BrokWebSearchResult {
  title?: string
  link?: string
  snippet?: string
  date?: string
}

interface BrokWebSearchResponse {
  organic?: unknown
  base_resp?: {
    status_code?: number
    status_msg?: string
  }
}

function getBrokSearchApiKey(): string {
  return (
    process.env.MINIMAX_CODING_PLAN_API_KEY ||
    process.env.BROK_PROVIDER_API_KEY ||
    process.env.OPENAI_COMPATIBLE_API_KEY ||
    BROK_PROVIDER_API_KEY
  )
}

function getBrokSearchUrl(): string {
  const host = (process.env.MINIMAX_API_HOST || BROK_PROVIDER_BASE_URL).replace(
    /\/v1\/?$/,
    ''
  )
  return `${host}/v1/coding_plan/search`
}

function getSearchTimeoutMs() {
  const configured = Number.parseInt(
    process.env.BROK_SEARCH_TIMEOUT_MS || '',
    10
  )
  return Number.isFinite(configured) && configured > 0 ? configured : 8000
}

function normalizeOrganicResults(organic: unknown): BrokWebSearchResult[] {
  if (!Array.isArray(organic)) {
    return []
  }
  return organic
    .filter((item: unknown): item is Record<string, unknown> => {
      return Boolean(item && typeof item === 'object')
    })
    .map((item: Record<string, unknown>) => ({
      title: typeof item.title === 'string' ? item.title : undefined,
      link: typeof item.link === 'string' ? item.link : undefined,
      snippet: typeof item.snippet === 'string' ? item.snippet : undefined,
      date: typeof item.date === 'string' ? item.date : undefined
    }))
}

export async function searchWithBrokWebSearch(
  query: string,
  count = 10
): Promise<BrokWebSearchResult[]> {
  const apiKey = getBrokSearchApiKey()
  if (!apiKey) {
    throw new Error('Brok provider API key not configured')
  }

  const response = await fetch(getBrokSearchUrl(), {
    method: 'POST',
    signal: AbortSignal.timeout(getSearchTimeoutMs()),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      q: query,
      count
    })
  })

  const text = await response.text()
  let data: BrokWebSearchResponse
  try {
    data = JSON.parse(text) as BrokWebSearchResponse
  } catch {
    throw new Error(`MiniMax web search returned non-JSON response`)
  }

  if (!response.ok || data.base_resp?.status_code) {
    const message =
      data.base_resp?.status_msg ||
      `MiniMax web search failed with status ${response.status}`
    throw new Error(message)
  }

  return normalizeOrganicResults(data.organic)
}
