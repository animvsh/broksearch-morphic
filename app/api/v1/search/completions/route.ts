import { NextRequest, NextResponse } from 'next/server'

import {
  apiKeyHasScope,
  forbiddenScopeResponse,
  unauthorizedResponse,
  verifyRequestAuth
} from '@/lib/brok/auth'
import {
  brokRateLimitHeaders,
  invalidRequestResponse,
  readJsonBody
} from '@/lib/brok/http'
import { BROK_MODELS, isValidBrokModel } from '@/lib/brok/models'
import { checkRateLimit, recordRateLimitEvent } from '@/lib/brok/rate-limiter'
import {
  type BrokSearchEvent,
  type SearchResponse,
  streamSearchPipeline
} from '@/lib/brok/search-pipeline'
import {
  checkUsageLimits,
  generateRequestId,
  recordUsage,
  usageLimitResponse
} from '@/lib/brok/usage-tracker'

export const runtime = 'nodejs'

function sseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

function usagePayload(searchResult: SearchResponse) {
  return {
    search_queries: searchResult.searchQueries,
    prompt_tokens: searchResult.tokensUsed,
    completion_tokens: Math.round(searchResult.answer.length / 4),
    total_tokens:
      searchResult.tokensUsed + Math.round(searchResult.answer.length / 4)
  }
}

function completionPayload({
  requestId,
  model,
  searchResult
}: {
  requestId: string
  model: string
  searchResult: SearchResponse
}) {
  return {
    id: requestId,
    object: 'search.completion',
    model,
    resolved_query: searchResult.resolvedQuery,
    classification: searchResult.classification,
    search_queries: searchResult.searchQueryList,
    choices: [
      {
        message: {
          role: 'assistant',
          content: searchResult.answer
        }
      }
    ],
    citations: searchResult.citations,
    follow_ups: searchResult.followUps,
    usage: usagePayload(searchResult)
  }
}

function normalizeSearchDepth(value: unknown): 'lite' | 'standard' | 'deep' {
  if (value === 'deep' || value === 'advanced') return 'deep'
  if (value === 'lite' || value === 'basic' || value === 'quick') return 'lite'
  return 'standard'
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  const requestId = generateRequestId()

  // Auth
  const auth = await verifyRequestAuth(request)
  if (!auth.success) {
    return unauthorizedResponse(auth)
  }
  if (!apiKeyHasScope(auth.apiKey, 'search:write')) {
    return forbiddenScopeResponse('search:write')
  }
  const usageLimit = await checkUsageLimits({
    apiKey: auth.apiKey,
    workspace: auth.workspace
  })
  if (!usageLimit.allowed) {
    return usageLimitResponse(usageLimit)
  }

  // Parse body
  const parsedBody = await readJsonBody<{
    query?: unknown
    model?: unknown
    stream?: unknown
    recency_days?: number
    domains?: unknown
    depth?: unknown
    search_depth?: unknown
  }>(request)
  if (!parsedBody.ok) {
    return parsedBody.response
  }

  const body = parsedBody.body
  const {
    query,
    model = 'brok-search',
    stream = true,
    recency_days,
    domains
  } = body
  const depth = normalizeSearchDepth(body.depth ?? body.search_depth)
  const searchDomains = Array.isArray(domains)
    ? domains.filter((domain): domain is string => typeof domain === 'string')
    : undefined

  if (typeof query !== 'string' || query.trim().length === 0) {
    return invalidRequestResponse(
      'missing_query',
      'query must be a non-empty string.'
    )
  }

  if (typeof model !== 'string') {
    return invalidRequestResponse('invalid_model', 'model must be a string.')
  }

  // Validate model supports search
  if (!isValidBrokModel(model) || !BROK_MODELS[model].supportsSearch) {
    return NextResponse.json(
      {
        error: {
          type: 'invalid_request_error',
          code: 'invalid_model',
          message:
            'Model does not support search. Use brok-search, brok-search-pro, or a MiniMax-M2 search-capable model.'
        }
      },
      { status: 400 }
    )
  }

  const allowedModels = auth.apiKey.allowedModels as string[]
  if (allowedModels.length > 0 && !allowedModels.includes(model)) {
    return NextResponse.json(
      {
        error: {
          type: 'invalid_request_error',
          code: 'model_not_allowed',
          message: `This API key does not have access to ${model}.`
        }
      },
      { status: 403 }
    )
  }

  // Check rate limit
  const rateLimit = await checkRateLimit(
    auth.apiKey.id,
    auth.workspace.id,
    auth.apiKey.rpmLimit ?? 60
  )

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: {
          type: 'rate_limit_error',
          code: 'rate_limit_exceeded',
          message: 'Rate limit exceeded.',
          retry_after_seconds: Math.ceil(
            (rateLimit.resetAt * 1000 - Date.now()) / 1000
          )
        }
      },
      {
        status: 429,
        headers: brokRateLimitHeaders({
          limit: rateLimit.limit,
          current: rateLimit.limit,
          resetAt: rateLimit.resetAt,
          includeRetryAfter: true
        })
      }
    )
  }

  await recordRateLimitEvent(
    auth.apiKey.id,
    auth.workspace.id,
    'rpm',
    rateLimit.limit,
    rateLimit.current + 1,
    false
  )

  if (stream) {
    const encoder = new TextEncoder()

    return new Response(
      new ReadableStream({
        async start(controller) {
          const send = (event: string, data: unknown) => {
            try {
              controller.enqueue(encoder.encode(sseEvent(event, data)))
            } catch (err) {
              // Stream may have been closed by the client; ignore enqueue errors.
              console.warn('SSE enqueue failed:', err)
            }
          }

          // Forward a pipeline event to the client with the proper PRD event
          // name. This is the central mapping that turns per-stage pipeline
          // events into the streaming UX the PRD requires.
          const forward = (event: BrokSearchEvent) => {
            switch (event.type) {
              case 'query_resolved':
                send('search.step', {
                  id: requestId,
                  message: 'Planning search query',
                  status: 'running'
                })
                send('query_resolved', {
                  id: requestId,
                  query: event.query,
                  resolved_query: event.resolvedQuery,
                  classification: event.classification,
                  search_queries: event.searchQueries
                })
                return
              case 'search_started':
                send('search.step', {
                  id: requestId,
                  message: 'Fetching and ranking sources',
                  status: 'running'
                })
                send('search_started', {
                  id: requestId,
                  depth: event.depth,
                  recency_days: event.recencyDays,
                  domains: event.domains,
                  search_queries: event.searchQueries
                })
                return
              case 'source_found':
                send('source_found', {
                  id: requestId,
                  index: event.index,
                  source: event.source
                })
                return
              case 'source_read':
                send('source_read', {
                  id: requestId,
                  source_id: event.sourceId,
                  url: event.url,
                  title: event.title,
                  quality_score: event.qualityScore
                })
                return
              case 'answer_delta':
                send('answer_delta', {
                  id: requestId,
                  delta: event.delta
                })
                return
              case 'citation_added':
                send('citation_added', {
                  id: requestId,
                  citation_id: event.citationId,
                  marker: event.marker,
                  url: event.url
                })
                return
              case 'follow_ups_generated':
                send('follow_ups_generated', {
                  id: requestId,
                  follow_ups: event.followUps
                })
                return
              case 'done':
                return
            }
          }

          // Track partial state so we can build a SearchResponse for the
          // terminal `search.completion` event and record usage.
          const partial: {
            resolvedQuery?: string
            classification?: SearchResponse['classification']
            searchQueries: string[]
            answer: string
            citations: SearchResponse['citations']
            followUps: SearchResponse['followUps']
            tokensUsed: number
          } = {
            resolvedQuery: undefined,
            classification: undefined,
            searchQueries: [],
            answer: '',
            citations: [],
            followUps: [],
            tokensUsed: 0
          }

          try {
            for await (const event of streamSearchPipeline({
              query,
              depth,
              recencyDays: recency_days,
              domains: searchDomains
            })) {
              switch (event.type) {
                case 'query_resolved':
                  partial.resolvedQuery = event.resolvedQuery
                  partial.classification = event.classification
                  partial.searchQueries = event.searchQueries
                  break
                case 'source_found':
                  partial.citations.push(event.source)
                  break
                case 'answer_delta':
                  partial.answer += event.delta
                  break
                case 'follow_ups_generated':
                  partial.followUps = event.followUps
                  break
                case 'done':
                  partial.citations = event.citations
                  partial.followUps = event.followUps
                  partial.tokensUsed = event.tokensUsed
                  partial.answer = event.answer
                  break
              }
              forward(event)
            }

            const latencyMs = Date.now() - startTime
            const searchCost = 0.001 * partial.searchQueries.length
            const tokenCost = (partial.tokensUsed / 1_000_000) * 0.1
            const providerCost = searchCost + tokenCost
            const billedAmount = providerCost * 1.5

            const searchResult: SearchResponse = {
              answer: partial.answer,
              citations: partial.citations,
              searchQueries: partial.searchQueries.length,
              searchQueryList: partial.searchQueries,
              tokensUsed: partial.tokensUsed,
              resolvedQuery: partial.resolvedQuery ?? query,
              classification:
                partial.classification ?? {
                  type: 'evergreen/explainer',
                  needsSearch: true,
                  reason: 'streamed'
                },
              followUps: partial.followUps
            }

            await recordUsage({
              requestId,
              workspaceId: auth.workspace.id,
              userId: auth.apiKey.userId,
              apiKeyId: auth.apiKey.id,
              endpoint: 'search',
              model,
              provider: 'Brok',
              inputTokens: partial.tokensUsed,
              outputTokens: Math.round(partial.answer.length / 4),
              searchQueries: partial.searchQueries.length,
              providerCostUsd: providerCost,
              billedUsd: billedAmount,
              latencyMs,
              status: 'success'
            })

            send('search.step', {
              id: requestId,
              message: 'Answer ready',
              status: 'done',
              citations: partial.citations.length
            })
            send(
              'search.completion',
              completionPayload({ requestId, model, searchResult })
            )
            send('done', {
              id: requestId,
              usage: usagePayload(searchResult)
            })
            try {
              controller.enqueue(encoder.encode('data: [DONE]\n\n'))
            } catch (err) {
              console.warn('SSE enqueue (DONE) failed:', err)
            }
            controller.close()
          } catch (error) {
            const latencyMs = Date.now() - startTime

            await recordUsage({
              requestId,
              workspaceId: auth.workspace.id,
              userId: auth.apiKey.userId,
              apiKeyId: auth.apiKey.id,
              endpoint: 'search',
              model,
              provider: 'Brok',
              inputTokens: 0,
              outputTokens: 0,
              searchQueries: 0,
              providerCostUsd: 0,
              billedUsd: 0,
              latencyMs,
              status: 'error',
              errorCode:
                error instanceof Error ? error.message : 'unknown_error'
            })

            send('search.error', {
              id: requestId,
              error: {
                type: 'internal_error',
                code: 'search_error',
                message:
                  'Brok search could not complete the request. Please try again.'
              }
            })
            controller.close()
          }
        }
      }),
      {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Brok-Request-Id': requestId,
          ...brokRateLimitHeaders({
            limit: rateLimit.limit,
            current: rateLimit.current + 1,
            resetAt: rateLimit.resetAt
          })
        }
      }
    )
  }

  // Non-streaming fallback: collect all events into a SearchResponse.
  try {
    const collected: SearchResponse = {
      answer: '',
      citations: [],
      searchQueries: 0,
      searchQueryList: [],
      tokensUsed: 0,
      resolvedQuery: query,
      classification: {
        type: 'evergreen/explainer',
        needsSearch: true,
        reason: 'sync'
      },
      followUps: []
    }
    let collectedClassification: SearchResponse['classification'] | undefined
    for await (const event of streamSearchPipeline({
      query,
      depth,
      recencyDays: recency_days,
      domains: searchDomains
    })) {
      switch (event.type) {
        case 'query_resolved':
          collected.resolvedQuery = event.resolvedQuery
          collectedClassification = event.classification
          collected.searchQueryList = event.searchQueries
          collected.searchQueries = event.searchQueries.length
          break
        case 'source_found':
          collected.citations.push(event.source)
          break
        case 'answer_delta':
          collected.answer += event.delta
          break
        case 'follow_ups_generated':
          collected.followUps = event.followUps
          break
        case 'done':
          collected.citations = event.citations
          collected.followUps = event.followUps
          collected.tokensUsed = event.tokensUsed
          collected.answer = event.answer
          break
      }
    }

    const latencyMs = Date.now() - startTime

    if (collectedClassification) {
      collected.classification = collectedClassification
    }

    // Calculate costs
    const searchCost = 0.001 * collected.searchQueries // $0.001 per search
    const tokenCost = (collected.tokensUsed / 1_000_000) * 0.1
    const providerCost = searchCost + tokenCost
    const billedAmount = providerCost * 1.5

    // Record usage
    await recordUsage({
      requestId,
      workspaceId: auth.workspace.id,
      userId: auth.apiKey.userId,
      apiKeyId: auth.apiKey.id,
      endpoint: 'search',
      model,
      provider: 'Brok',
      inputTokens: collected.tokensUsed,
      outputTokens: Math.round(collected.answer.length / 4),
      searchQueries: collected.searchQueries,
      providerCostUsd: providerCost,
      billedUsd: billedAmount,
      latencyMs,
      status: 'success'
    })

    return NextResponse.json(
      completionPayload({ requestId, model, searchResult: collected }),
      {
        headers: {
          'X-Brok-Request-Id': requestId,
          ...brokRateLimitHeaders({
            limit: rateLimit.limit,
            current: rateLimit.current + 1,
            resetAt: rateLimit.resetAt
          })
        }
      }
    )
  } catch (error) {
    const latencyMs = Date.now() - startTime

    await recordUsage({
      requestId,
      workspaceId: auth.workspace.id,
      userId: auth.apiKey.userId,
      apiKeyId: auth.apiKey.id,
      endpoint: 'search',
      model,
      provider: 'Brok',
      inputTokens: 0,
      outputTokens: 0,
      searchQueries: 0,
      providerCostUsd: 0,
      billedUsd: 0,
      latencyMs,
      status: 'error',
      errorCode: error instanceof Error ? error.message : 'unknown_error'
    })

    return NextResponse.json(
      {
        error: {
          type: 'internal_error',
          code: 'search_error',
          message:
            'Brok search could not complete the request. Please try again.'
        }
      },
      { status: 500 }
    )
  }
}
