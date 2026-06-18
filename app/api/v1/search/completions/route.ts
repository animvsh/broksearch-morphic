import { NextRequest, NextResponse } from 'next/server'

import {
  apiKeyHasScope,
  forbiddenScopeResponse,
  unauthorizedResponse,
  verifyRequestAuth
} from '@/lib/brok/auth'
import { brokRateLimitHeaders, readJsonBody } from '@/lib/brok/http'
import {
  beginIdempotentRequest,
  completeIdempotentRequest,
  idempotencyHeaders
} from '@/lib/brok/idempotency'
import {
  applyBrokMarkup,
  calculateSearchProviderCostUsd
} from '@/lib/brok/pricing'
import { checkRateLimit, recordRateLimitEvent } from '@/lib/brok/rate-limiter'
import {
  buildSearchQueries,
  classifyQuery,
  resolveQuery,
  runSearchPipeline
} from '@/lib/brok/search-pipeline'
import { validateSearchApiRequest } from '@/lib/brok/search-request-validation'
import {
  checkUsageLimits,
  generateRequestId,
  recordUsage,
  usageLimitResponse,
  UsageRecordError
} from '@/lib/brok/usage-tracker'

export const runtime = 'nodejs'

function sseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

function sourceEventKey(citation: { id?: string; url?: string }) {
  return citation.id || citation.url || ''
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
  const validation = validateSearchApiRequest({
    body,
    allowedModels: auth.apiKey.allowedModels,
    domainMode: 'filter'
  })
  if (!validation.ok) {
    return validation.response
  }
  const {
    query,
    model,
    stream: shouldStream,
    depth,
    domains: searchDomains,
    recencyDays
  } = validation.value

  const idempotency = await beginIdempotentRequest({
    request,
    workspaceId: auth.workspace.id,
    apiKeyId: auth.apiKey.id,
    route: '/api/v1/search/completions',
    body,
    stream: shouldStream
  })
  if (idempotency.kind === 'replay' || idempotency.kind === 'blocked') {
    return idempotency.response
  }

  const usageLimit = await checkUsageLimits({
    apiKey: auth.apiKey,
    workspace: auth.workspace
  })
  if (!usageLimit.allowed) {
    await completeIdempotentRequest({
      idempotency,
      requestId,
      status: 'failed'
    })
    return usageLimitResponse(usageLimit)
  }

  // Check rate limit
  const rateLimit = await checkRateLimit(
    auth.apiKey.id,
    auth.workspace.id,
    auth.apiKey.rpmLimit ?? 60
  )

  if (!rateLimit.allowed) {
    if (rateLimit.reason === 'rate_limit_check_failed') {
      await completeIdempotentRequest({
        idempotency,
        requestId,
        status: 'failed'
      })
      return NextResponse.json(
        {
          error: {
            type: 'service_unavailable',
            code: 'rate_limit_check_failed',
            message:
              'Rate limit check is temporarily unavailable. Please retry shortly.'
          }
        },
        { status: 503 }
      )
    }
    await recordRateLimitEvent(
      auth.apiKey.id,
      auth.workspace.id,
      'rpm',
      rateLimit.limit,
      rateLimit.current + 1,
      true
    )

    await completeIdempotentRequest({
      idempotency,
      requestId,
      status: 'failed'
    })
    return NextResponse.json(
      {
        error: {
          type: 'rate_limit_error',
          code: 'rate_limit_exceeded',
          message: 'Rate limit exceeded for this API key.',
          limit: `${rateLimit.limit} requests per minute`,
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

  if (shouldStream) {
    const encoder = new TextEncoder()

    return new Response(
      new ReadableStream({
        async start(controller) {
          const send = (event: string, data: unknown) => {
            controller.enqueue(encoder.encode(sseEvent(event, data)))
          }
          const emittedSourceKeys = new Set<string>()
          let streamedAnswer = ''
          let writingStatusSent = false
          const sendSourceEvents = (
            citations: Awaited<
              ReturnType<typeof runSearchPipeline>
            >['citations']
          ) => {
            citations.forEach((citation, index) => {
              const key = sourceEventKey(citation)
              if (key && emittedSourceKeys.has(key)) return
              if (key) emittedSourceKeys.add(key)

              const citationNumber = index + 1

              send('source_found', {
                id: requestId,
                index: citationNumber,
                source: citation
              })
              send('source', {
                id: requestId,
                source_id: citation.id,
                citation_number: citationNumber,
                title: citation.title,
                url: citation.url,
                domain: citation.publisher,
                snippet: citation.snippet,
                retrieved_at: citation.retrievedAt,
                quality_score: citation.qualityScore
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
                marker: `[${citationNumber}]`,
                url: citation.url
              })
              send('citation', {
                id: requestId,
                source_id: citation.id,
                citation_number: citationNumber,
                url: citation.url
              })
            })
          }

          const classification = classifyQuery(query)
          const resolvedQuery = resolveQuery(query, classification)
          const searchQueries = buildSearchQueries({
            query,
            classification,
            depth,
            limit: depth === 'deep' ? 5 : depth === 'lite' ? 1 : 3,
            recencyDays,
            domains: searchDomains
          })

          send('search.step', {
            id: requestId,
            message: 'Planning search query',
            status: 'running'
          })
          send('status', {
            id: requestId,
            message: 'Understanding your question'
          })
          send('query_resolved', {
            id: requestId,
            query,
            resolved_query: resolvedQuery,
            classification,
            search_queries: searchQueries
          })
          send('query', {
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
            send('status', {
              id: requestId,
              message: 'Searching the web'
            })
            send('search_started', {
              id: requestId,
              depth,
              recency_days: recencyDays,
              domains: searchDomains ?? [],
              search_queries: searchQueries
            })

            const searchResult = await runSearchPipeline({
              query,
              depth,
              recencyDays,
              domains: searchDomains,
              signal: request.signal,
              onSources: sources => {
                send('search.step', {
                  id: requestId,
                  message: `Found ${sources.length} source${sources.length === 1 ? '' : 's'}`,
                  status: 'running',
                  citations: sources.length
                })
                send('status', {
                  id: requestId,
                  message: 'Reading sources'
                })
                sendSourceEvents(sources)
              },
              onAnswerDelta: delta => {
                if (!delta) return
                if (!writingStatusSent) {
                  writingStatusSent = true
                  send('status', {
                    id: requestId,
                    message: 'Writing answer'
                  })
                }
                streamedAnswer += delta
                send('answer_delta', {
                  id: requestId,
                  delta,
                  text: delta
                })
              }
            })

            const latencyMs = Date.now() - startTime
            const providerCost = calculateSearchProviderCostUsd(
              searchResult.searchQueries,
              searchResult.tokensUsed
            )

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
              billedUsd: applyBrokMarkup(providerCost),
              latencyMs,
              status: 'success'
            })
            await completeIdempotentRequest({
              idempotency,
              requestId,
              status: 'completed'
            })

            sendSourceEvents(searchResult.citations)

            if (!writingStatusSent) {
              writingStatusSent = true
              send('status', {
                id: requestId,
                message: 'Writing answer'
              })
            }

            if (!streamedAnswer) {
              send('answer_delta', {
                id: requestId,
                delta: searchResult.answer,
                text: searchResult.answer
              })
            } else if (searchResult.answer.startsWith(streamedAnswer)) {
              const remainingAnswer = searchResult.answer.slice(
                streamedAnswer.length
              )
              if (remainingAnswer) {
                send('answer_delta', {
                  id: requestId,
                  delta: remainingAnswer,
                  text: remainingAnswer
                })
              }
            }
            send('follow_ups_generated', {
              id: requestId,
              follow_ups: searchResult.followUps
            })
            send('follow_ups', {
              id: requestId,
              items: searchResult.followUps,
              follow_ups: searchResult.followUps
            })

            send('search.step', {
              id: requestId,
              message: 'Answer ready',
              status: 'done',
              citations: searchResult.citations.length
            })
            send('status', {
              id: requestId,
              message: 'Answer ready'
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
            if (error instanceof UsageRecordError) {
              await completeIdempotentRequest({
                idempotency,
                requestId,
                status: 'failed'
              })
              send('search.error', {
                id: requestId,
                error: {
                  type: 'service_unavailable',
                  code: 'usage_storage_unavailable',
                  message:
                    'Usage ledger storage is temporarily unavailable. Please retry shortly.'
                }
              })
              controller.close()
              return
            }

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
            await completeIdempotentRequest({
              idempotency,
              requestId,
              status: 'failed'
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
          ...idempotencyHeaders({
            key: idempotency.kind === 'reserved' ? idempotency.key : undefined
          }),
          ...brokRateLimitHeaders({
            limit: rateLimit.limit,
            current: rateLimit.current + 1,
            resetAt: rateLimit.resetAt
          })
        }
      }
    )
  }

  try {
    const searchResult = await runSearchPipeline({
      query,
      depth,
      recencyDays,
      domains: searchDomains
    })

    const latencyMs = Date.now() - startTime

    const providerCost = calculateSearchProviderCostUsd(
      searchResult.searchQueries,
      searchResult.tokensUsed
    )

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
      billedUsd: applyBrokMarkup(providerCost),
      latencyMs,
      status: 'success'
    })

    const brokResponse = completionPayload({ requestId, model, searchResult })
    const responseHeaders = {
      'X-Brok-Request-Id': requestId,
      ...idempotencyHeaders({
        key: idempotency.kind === 'reserved' ? idempotency.key : undefined
      }),
      ...brokRateLimitHeaders({
        limit: rateLimit.limit,
        current: rateLimit.current + 1,
        resetAt: rateLimit.resetAt
      })
    }
    await completeIdempotentRequest({
      idempotency,
      requestId,
      responseStatus: 200,
      responseBody: brokResponse,
      responseHeaders
    })

    return NextResponse.json(brokResponse, {
      headers: responseHeaders
    })
  } catch (error) {
    if (error instanceof UsageRecordError) {
      await completeIdempotentRequest({
        idempotency,
        requestId,
        status: 'failed'
      })
      return usageStorageUnavailableResponse(requestId)
    }

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
    await completeIdempotentRequest({
      idempotency,
      requestId,
      status: 'failed'
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

function usageStorageUnavailableResponse(requestId: string) {
  return NextResponse.json(
    {
      error: {
        type: 'service_unavailable',
        code: 'usage_storage_unavailable',
        message:
          'Usage ledger storage is temporarily unavailable. Please retry shortly.'
      }
    },
    {
      status: 503,
      headers: {
        'X-Brok-Request-Id': requestId
      }
    }
  )
}
