import { NextRequest, NextResponse } from 'next/server'

import {
  apiKeyHasScope,
  forbiddenScopeResponse,
  unauthorizedResponse,
  verifyRequestAuth
} from '@/lib/brok/auth'
import { BROK_MODELS, isValidBrokModel } from '@/lib/brok/models'
import { checkRateLimit, recordRateLimitEvent } from '@/lib/brok/rate-limiter'
import {
  buildSearchQueries,
  classifyQuery,
  resolveQuery,
  runSearchPipeline
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

function usagePayload(
  searchResult: Awaited<ReturnType<typeof runSearchPipeline>>
) {
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
  searchResult: Awaited<ReturnType<typeof runSearchPipeline>>
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
  const body = await request.json()
  const {
    query,
    model = 'brok-search',
    depth = 'standard',
    stream = true,
    recency_days,
    domains
  } = body

  if (!query) {
    return NextResponse.json(
      {
        error: {
          type: 'invalid_request_error',
          code: 'missing_query',
          message: 'Query is required'
        }
      },
      { status: 400 }
    )
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
      { status: 429 }
    )
  }

  if (stream) {
    const encoder = new TextEncoder()

    return new Response(
      new ReadableStream({
        async start(controller) {
          const send = (event: string, data: unknown) => {
            controller.enqueue(encoder.encode(sseEvent(event, data)))
          }

          const classification = classifyQuery(query)
          const resolvedQuery = resolveQuery(query, classification)
          const searchQueries = buildSearchQueries({
            query,
            classification,
            depth,
            limit: depth === 'deep' ? 5 : depth === 'lite' ? 1 : 3,
            recencyDays: recency_days,
            domains
          })

          send('search.step', {
            id: requestId,
            message: 'Planning search query',
            status: 'running'
          })
          send('query_resolved', {
            id: requestId,
            query,
            resolved_query: resolvedQuery,
            classification,
            search_queries: searchQueries
          })

          try {
            send('search.step', {
              id: requestId,
              message: 'Fetching and ranking sources',
              status: 'running'
            })
            send('search_started', {
              id: requestId,
              depth,
              recency_days,
              domains: Array.isArray(domains) ? domains : [],
              search_queries: searchQueries
            })

            const searchResult = await runSearchPipeline({
              query,
              depth,
              recencyDays: recency_days,
              domains
            })

            const latencyMs = Date.now() - startTime
            const searchCost = 0.001 * searchResult.searchQueries
            const tokenCost = (searchResult.tokensUsed / 1_000_000) * 0.1
            const providerCost = searchCost + tokenCost
            const billedAmount = providerCost * 1.5

            await recordUsage({
              requestId,
              workspaceId: auth.workspace.id,
              userId: auth.apiKey.userId,
              apiKeyId: auth.apiKey.id,
              endpoint: 'search',
              model,
              provider: 'Brok',
              inputTokens: searchResult.tokensUsed,
              outputTokens: Math.round(searchResult.answer.length / 4),
              searchQueries: searchResult.searchQueries,
              providerCostUsd: providerCost,
              billedUsd: billedAmount,
              latencyMs,
              status: 'success'
            })

            searchResult.citations.forEach((citation, index) => {
              send('source_found', {
                id: requestId,
                index: index + 1,
                source: citation
              })
              send('source_read', {
                id: requestId,
                source_id: citation.id,
                url: citation.url,
                title: citation.title,
                quality_score: citation.qualityScore
              })
              send('citation_added', {
                id: requestId,
                citation_id: citation.id,
                marker: `[${index + 1}]`,
                url: citation.url
              })
            })

            send('answer_delta', {
              id: requestId,
              delta: searchResult.answer
            })
            send('follow_ups_generated', {
              id: requestId,
              follow_ups: searchResult.followUps
            })

            send('search.step', {
              id: requestId,
              message: 'Answer ready',
              status: 'done',
              citations: searchResult.citations.length
            })
            send(
              'search.completion',
              completionPayload({ requestId, model, searchResult })
            )
            send('done', {
              id: requestId,
              usage: usagePayload(searchResult)
            })
            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
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
          'X-Brok-Request-Id': requestId
        }
      }
    )
  }

  try {
    const searchResult = await runSearchPipeline({
      query,
      depth,
      recencyDays: recency_days,
      domains
    })

    const latencyMs = Date.now() - startTime

    // Calculate costs
    const searchCost = 0.001 * searchResult.searchQueries // $0.001 per search
    const tokenCost = (searchResult.tokensUsed / 1_000_000) * 0.1
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
      inputTokens: searchResult.tokensUsed,
      outputTokens: Math.round(searchResult.answer.length / 4),
      searchQueries: searchResult.searchQueries,
      providerCostUsd: providerCost,
      billedUsd: billedAmount,
      latencyMs,
      status: 'success'
    })

    return NextResponse.json(
      completionPayload({ requestId, model, searchResult }),
      {
        headers: {
          'X-Brok-Request-Id': requestId
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
