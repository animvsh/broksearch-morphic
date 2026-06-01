import { NextRequest, NextResponse } from 'next/server'

import {
  apiKeyHasScope,
  forbiddenScopeResponse,
  unauthorizedResponse,
  verifyRequestAuth
} from '@/lib/brok/auth'
import { BROK_MODELS } from '@/lib/brok/models'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const auth = await verifyRequestAuth(request)
  if (!auth.success) {
    return unauthorizedResponse(auth)
  }
  if (!apiKeyHasScope(auth.apiKey, 'usage:read')) {
    return forbiddenScopeResponse('usage:read')
  }

  const showPricing =
    apiKeyHasScope(auth.apiKey, 'usage:read') &&
    request.nextUrl.searchParams.get('include_pricing') === 'true'

  const models = Object.entries(BROK_MODELS).map(([id, config]) => ({
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
  }))

  return NextResponse.json({
    object: 'list',
    data: models
  })
}
