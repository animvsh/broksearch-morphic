import { NextResponse } from 'next/server'

import { BROK_MODELS } from '@/lib/brok/models'

export const runtime = 'edge'

export async function GET() {
  const models = Object.entries(BROK_MODELS).map(([id, config]) => ({
    id,
    name: config.name,
    description: config.description,
    provider: 'brok',
    input_cost_per_million: config.inputCostPerMillion,
    output_cost_per_million: config.outputCostPerMillion,
    max_tokens: config.maxTokens,
    context_window: config.contextWindow ?? config.maxTokens,
    supports_search: config.supportsSearch,
    supports_streaming: config.supportsStreaming,
    supports_tools: config.supportsTools,
    supports_code: config.supportsCode ?? false
  }))

  return NextResponse.json({
    object: 'list',
    data: models
  })
}
