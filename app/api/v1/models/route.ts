import { NextRequest, NextResponse } from 'next/server'

import {
  apiKeyHasScope,
  unauthorizedResponse,
  verifyRequestAuth
} from '@/lib/brok/auth'
import { BROK_MODELS, BROK_PUBLIC_MODEL_IDS } from '@/lib/brok/models'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const auth = await verifyRequestAuth(request)
  if (!auth.success) {
    return unauthorizedResponse(auth)
  }

  const showPricing =
    apiKeyHasScope(auth.apiKey, 'usage:read') &&
    request.nextUrl.searchParams.get('include_pricing') === 'true'

  const allowedModels = Array.isArray(auth.apiKey.allowedModels)
    ? (auth.apiKey.allowedModels as string[])
    : []
  const modelIds =
    allowedModels.length > 0
      ? BROK_PUBLIC_MODEL_IDS.filter(id => allowedModels.includes(id))
      : BROK_PUBLIC_MODEL_IDS

  const models = modelIds.map(id => {
    const config = BROK_MODELS[id]

    return {
      id,
      name: config.name,
      description: config.description,
      provider: 'brok',
      max_tokens: config.maxTokens,
      context_window: config.contextWindow ?? config.maxTokens,
      supports_search: config.supportsSearch,
      supports_streaming: config.supportsStreaming,
      supports_tools: config.supportsTools,
      supports_code: config.supportsCode ?? false,
      ...(showPricing
        ? {
            input_cost_per_million: config.inputCostPerMillion,
            output_cost_per_million: config.outputCostPerMillion
          }
        : {})
    }
  })

  return NextResponse.json({
    object: 'list',
    data: models
  })
}
