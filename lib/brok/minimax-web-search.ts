import { MINIMAX_API_KEY, MINIMAX_BASE_URL } from '@/lib/ai/minimax'

export interface MiniMaxWebSearchResult {
  title?: string
  link?: string
  snippet?: string
  date?: string
}

interface MiniMaxWebSearchResponse {
  organic?: unknown
  base_resp?: {
    status_code?: number
    status_msg?: string
  }
}

function getMiniMaxSearchApiKey(): string {
  return (
    process.env.MINIMAX_CODING_PLAN_API_KEY ||
    process.env.MINIMAX_API_KEY ||
    process.env.OPENAI_COMPATIBLE_API_KEY ||
    MINIMAX_API_KEY
  )
}

function getMiniMaxSearchUrl(): string {
  const host = (process.env.MINIMAX_API_HOST || MINIMAX_BASE_URL).replace(
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

function normalizeOrganicResults(organic: unknown): MiniMaxWebSearchResult[] {
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

export async function searchWithMiniMaxWebSearch(
  query: string,
  count = 10
): Promise<MiniMaxWebSearchResult[]> {
  const apiKey = getMiniMaxSearchApiKey()
  if (!apiKey) {
    throw new Error('Brok provider API key not configured')
  }

  const response = await fetch(getMiniMaxSearchUrl(), {
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
  let data: MiniMaxWebSearchResponse
  try {
    data = JSON.parse(text) as MiniMaxWebSearchResponse
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
