import {
  getCurrentAppAccess,
  hasFeatureAccess,
  isAppAccessGateEnabled
} from '@/lib/auth/app-access'
import {
  getCurrentUserIdForOptionalGuestSearch,
  isGuestSearchEnabled,
  isGuestSearchMode
} from '@/lib/auth/guest-search'
import {
  runSearchPipeline,
  type SearchResult
} from '@/lib/brok/search-pipeline'
import { normalizeSearchMode } from '@/lib/config/search-modes'
import { checkAndEnforceOverallChatLimit } from '@/lib/rate-limit/chat-limits'
import { checkAndEnforceGuestLimit } from '@/lib/rate-limit/guest-limit'
import type { SearchMode } from '@/lib/types/search'

export const runtime = 'nodejs'
export const maxDuration = 60

type SessionSearchBody = {
  query?: unknown
  mode?: unknown
  depth?: unknown
  recency_days?: unknown
  domains?: unknown
}

function sseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

function normalizeDepth(mode: SearchMode, value: unknown) {
  if (value === 'deep' || mode === 'deep') return 'deep'
  if (value === 'lite' || value === 'basic' || mode === 'quick') return 'lite'
  return 'standard'
}

function sourceEventKey(source: Pick<SearchResult, 'id' | 'url'>) {
  return source.id || source.url
}

function normalizeDomains(value: unknown) {
  return Array.isArray(value) &&
    value.every(domain => typeof domain === 'string')
    ? value
    : undefined
}

function getRequestIp(req: Request) {
  const forwardedFor = req.headers.get('x-forwarded-for') || ''
  return (
    forwardedFor.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null
  )
}

function sendSourceEvents({
  send,
  requestId,
  emittedSourceKeys,
  sources
}: {
  send: (event: string, data: unknown) => void
  requestId: string
  emittedSourceKeys: Set<string>
  sources: SearchResult[]
}) {
  sources.forEach((source, index) => {
    const key = sourceEventKey(source)
    if (emittedSourceKeys.has(key)) return
    emittedSourceKeys.add(key)
    const citationNumber = index + 1

    send('source_found', {
      id: requestId,
      index: citationNumber,
      source
    })
    send('source', {
      id: requestId,
      source_id: source.id,
      citation_number: citationNumber,
      title: source.title,
      url: source.url,
      domain: source.publisher,
      snippet: source.snippet,
      retrieved_at: source.retrievedAt,
      quality_score: source.qualityScore
    })
    send('source_read', {
      id: requestId,
      source_id: source.id,
      url: source.url,
      title: source.title,
      quality_score: source.qualityScore
    })
    send('citation', {
      id: requestId,
      source_id: source.id,
      citation_number: citationNumber,
      url: source.url
    })
  })
}

export async function POST(req: Request) {
  let body: SessionSearchBody
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON payload' }, { status: 400 })
  }

  const query = typeof body.query === 'string' ? body.query.trim() : ''
  if (!query) {
    return Response.json({ error: 'query is required' }, { status: 400 })
  }

  const mode = normalizeSearchMode(
    typeof body.mode === 'string' ? body.mode : undefined
  )
  const userId = await getCurrentUserIdForOptionalGuestSearch(mode)
  const isGuest = !userId
  const canUseGuestSearch =
    isGuest && isGuestSearchEnabled() && isGuestSearchMode(mode)

  if (isAppAccessGateEnabled()) {
    const access = await getCurrentAppAccess()
    if (!access.user && !canUseGuestSearch) {
      return Response.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }
    if (access.user && !access.allowed) {
      return Response.json({ error: 'Access pending' }, { status: 403 })
    }
    if (access.user && !hasFeatureAccess(access, 'search')) {
      return Response.json({ error: 'Search access denied' }, { status: 403 })
    }
  }

  if (isGuest && !canUseGuestSearch) {
    return Response.json({ error: 'Authentication required' }, { status: 401 })
  }

  if (isGuest) {
    const guestLimitResponse = await checkAndEnforceGuestLimit(
      getRequestIp(req)
    )
    if (guestLimitResponse) return guestLimitResponse
  } else {
    const overallLimitResponse = await checkAndEnforceOverallChatLimit(userId)
    if (overallLimitResponse) return overallLimitResponse
  }

  const depth = normalizeDepth(mode, body.depth)
  const recencyDays =
    typeof body.recency_days === 'number' ? body.recency_days : undefined
  const domains = normalizeDomains(body.domains)
  const requestId = `session_${crypto.randomUUID()}`
  const encoder = new TextEncoder()

  return new Response(
    new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(sseEvent(event, data)))
        }
        const emittedSourceKeys = new Set<string>()

        try {
          send('status', {
            id: requestId,
            message: 'Searching web'
          })
          send('query', {
            id: requestId,
            query,
            mode,
            depth
          })

          const result = await runSearchPipeline({
            query,
            depth,
            recencyDays,
            domains,
            onSources: sources => {
              send('status', {
                id: requestId,
                message: `Reading ${sources.length} source${sources.length === 1 ? '' : 's'}`
              })
              sendSourceEvents({
                send,
                requestId,
                emittedSourceKeys,
                sources
              })
            }
          })

          sendSourceEvents({
            send,
            requestId,
            emittedSourceKeys,
            sources: result.citations
          })
          send('status', {
            id: requestId,
            message: 'Writing answer'
          })
          send('answer_delta', {
            id: requestId,
            delta: result.answer,
            text: result.answer
          })
          send('follow_ups', {
            id: requestId,
            items: result.followUps,
            follow_ups: result.followUps
          })
          send('done', {
            id: requestId,
            usage: {
              search_queries: result.searchQueries,
              total_tokens:
                result.tokensUsed + Math.round(result.answer.length / 4)
            }
          })
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        } catch {
          send('search.error', {
            id: requestId,
            error: {
              message: 'Brok search could not complete the request.'
            }
          })
        } finally {
          controller.close()
        }
      }
    }),
    {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Brok-Request-Id': requestId
      }
    }
  )
}
