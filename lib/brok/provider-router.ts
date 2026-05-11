import { and, asc, eq } from 'drizzle-orm'

import { db } from '@/lib/db'
import { providerRoutes } from '@/lib/db/schema'

import { BROK_MODELS, BrokModelId } from './models'

export interface ProviderRequest {
  model: string
  messages: Array<Record<string, unknown>>
  stream?: boolean
  temperature?: number
  maxTokens?: number
  topP?: number
  tools?: Array<{
    type: string
    function?: {
      name: string
      description?: string
      parameters?: Record<string, unknown>
    }
    web_search?: {
      top_n?: number
    }
  }>
  toolChoice?: {
    type: string
    web_search?: {
      top_n?: number
    }
  }
}

export interface ProviderResponse {
  id: string
  model: string
  choices: Array<{
    message: {
      role: string
      content: string
      tool_calls?: Array<{
        id: string
        type: string
        function: {
          name: string
          arguments: string
        }
      }>
    }
    finish_reason: string
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
  citations?: Array<{
    title?: string
    url: string
    publisher?: string
    snippet?: string
  }>
}

interface ResolvedProviderRoute {
  providerName: string
  providerModel: string
  inputCostPerMillion: number
  outputCostPerMillion: number
}

const DEFAULT_BROK_SYSTEM_MESSAGE =
  'You are Brok, a concise user-facing AI assistant. Do not reveal hidden reasoning, private analysis, planning notes, or chain-of-thought. Answer directly with the useful result only.'

let providerRoutesDatabaseUnavailable =
  process.env.BROK_PROVIDER_ROUTES_LOCAL === '1'

async function resolveProviderRoute(
  model: BrokModelId
): Promise<ResolvedProviderRoute> {
  const fallback = BROK_MODELS[model]

  if (providerRoutesDatabaseUnavailable) {
    return {
      providerName: fallback.provider,
      providerModel: fallback.providerModel,
      inputCostPerMillion: fallback.inputCostPerMillion,
      outputCostPerMillion: fallback.outputCostPerMillion
    }
  }

  let route:
    | {
        providerName: string
        providerModel: string
        inputCostPerMillion: string | null
        outputCostPerMillion: string | null
      }
    | undefined

  try {
    ;[route] = await db
      .select({
        providerName: providerRoutes.providerName,
        providerModel: providerRoutes.providerModel,
        inputCostPerMillion: providerRoutes.inputCostPerMillion,
        outputCostPerMillion: providerRoutes.outputCostPerMillion
      })
      .from(providerRoutes)
      .where(
        and(
          eq(providerRoutes.brokModel, model),
          eq(providerRoutes.isActive, true)
        )
      )
      .orderBy(asc(providerRoutes.priority))
      .limit(1)
  } catch (error) {
    providerRoutesDatabaseUnavailable = true
    const message = error instanceof Error ? error.message : String(error)
    console.warn(
      `[brok] Provider route database unavailable, using built-in route: ${message}`
    )
  }

  if (!route) {
    return {
      providerName: fallback.provider,
      providerModel: fallback.providerModel,
      inputCostPerMillion: fallback.inputCostPerMillion,
      outputCostPerMillion: fallback.outputCostPerMillion
    }
  }

  return {
    providerName: route.providerName,
    providerModel: route.providerModel,
    inputCostPerMillion: Number.parseFloat(route.inputCostPerMillion ?? '0'),
    outputCostPerMillion: Number.parseFloat(route.outputCostPerMillion ?? '0')
  }
}

export async function routeToProvider(
  model: BrokModelId,
  request: ProviderRequest
): Promise<ProviderResponse> {
  const response = await routeToProviderResponse(model, request)
  return response.json()
}

export async function routeToProviderResponse(
  model: BrokModelId,
  request: ProviderRequest
): Promise<Response> {
  const modelConfig = BROK_MODELS[model]

  if (!modelConfig) {
    throw new Error(`Unknown model: ${model}`)
  }

  const resolvedRoute = await resolveProviderRoute(model)

  // Transform request to provider format
  const providerRequest = transformToProviderRequest(
    model,
    request,
    resolvedRoute.providerModel
  )

  // Call appropriate provider
  const providerApiKey =
    process.env.OPENAI_COMPATIBLE_API_KEY || process.env.MINIMAX_API_KEY

  if (!providerApiKey) {
    throw new Error('Provider API key not configured')
  }

  if (resolvedRoute.providerName !== 'minimax') {
    throw new Error(
      `Unsupported provider route configured: ${resolvedRoute.providerName}`
    )
  }

  const providerBaseUrl =
    process.env.OPENAI_COMPATIBLE_API_BASE_URL || 'https://api.minimax.io/v1'

  const response = await fetch(`${providerBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${providerApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(providerRequest)
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Provider error: ${response.status} - ${error}`)
  }

  return response
}

function transformToProviderRequest(
  model: BrokModelId,
  request: ProviderRequest,
  providerModel: string
) {
  const modelConfig = BROK_MODELS[model]
  const hasSystemMessage = request.messages.some(
    message => message.role === 'system'
  )

  const providerRequest: Record<string, unknown> = {
    model: providerModel,
    messages: hasSystemMessage
      ? request.messages
      : [
          {
            role: 'system',
            content: DEFAULT_BROK_SYSTEM_MESSAGE
          },
          ...request.messages
        ],
    stream: request.stream,
    temperature: request.temperature,
    top_p: request.topP,
    max_tokens: request.maxTokens
  }

  // Add web search tools if supported and requested
  if (request.tools && modelConfig.supportsTools) {
    providerRequest.tools = request.tools
    if (request.toolChoice) {
      providerRequest.tool_choice = request.toolChoice
    }
  }

  return providerRequest
}

export async function calculateCost(
  model: BrokModelId,
  inputTokens: number,
  outputTokens: number
): Promise<number> {
  const route = await resolveProviderRoute(model)
  const inputCost = (inputTokens / 1_000_000) * route.inputCostPerMillion
  const outputCost = (outputTokens / 1_000_000) * route.outputCostPerMillion
  return inputCost + outputCost
}
