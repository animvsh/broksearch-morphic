export interface BrokModelConfig {
  name: string
  description: string
  provider: string
  providerModel: string
  inputCostPerMillion: number
  outputCostPerMillion: number
  maxTokens: number
  contextWindow?: number
  supportsSearch: boolean
  supportsStreaming: boolean
  supportsTools: boolean
  supportsCode?: boolean
}

const MINIMAX_CONTEXT_WINDOW = 204_800

export const BROK_MODELS: Record<string, BrokModelConfig> = {
  'brok-lite': {
    name: 'Brok Lite',
    description: 'Fast, low-cost reasoning for simple tasks',
    provider: 'minimax',
    providerModel: 'MiniMax-M2.7-highspeed',
    inputCostPerMillion: 0.1,
    outputCostPerMillion: 0.4,
    maxTokens: MINIMAX_CONTEXT_WINDOW,
    contextWindow: MINIMAX_CONTEXT_WINDOW,
    supportsStreaming: true,
    supportsSearch: false,
    supportsTools: false
  },
  'brok-search': {
    name: 'Brok Search',
    description: 'Search-powered answers with citations',
    provider: 'minimax',
    providerModel: 'MiniMax-M2.7',
    inputCostPerMillion: 0.1,
    outputCostPerMillion: 0.4,
    maxTokens: MINIMAX_CONTEXT_WINDOW,
    contextWindow: MINIMAX_CONTEXT_WINDOW,
    supportsStreaming: true,
    supportsSearch: true,
    supportsTools: true
  },
  'brok-search-pro': {
    name: 'Brok Search Pro',
    description: 'Deep search with 10-20 sources',
    provider: 'minimax',
    providerModel: 'MiniMax-M2.7',
    inputCostPerMillion: 0.15,
    outputCostPerMillion: 0.6,
    maxTokens: MINIMAX_CONTEXT_WINDOW,
    contextWindow: MINIMAX_CONTEXT_WINDOW,
    supportsStreaming: true,
    supportsSearch: true,
    supportsTools: true
  },
  'brok-code': {
    name: 'Brok Code',
    description:
      'Coding-agent model for Codex, Claude Code, and OpenAI-compatible tools',
    provider: 'minimax',
    providerModel: 'MiniMax-M2.7-highspeed',
    inputCostPerMillion: 0.1,
    outputCostPerMillion: 0.4,
    maxTokens: MINIMAX_CONTEXT_WINDOW,
    contextWindow: MINIMAX_CONTEXT_WINDOW,
    supportsStreaming: true,
    supportsSearch: false,
    supportsTools: true,
    supportsCode: true
  },
  'brok-agent': {
    name: 'Brok Agent',
    description: 'Tool-using agent with browser and search',
    provider: 'minimax',
    providerModel: 'MiniMax-M2.7',
    inputCostPerMillion: 0.15,
    outputCostPerMillion: 0.6,
    maxTokens: MINIMAX_CONTEXT_WINDOW,
    contextWindow: MINIMAX_CONTEXT_WINDOW,
    supportsStreaming: true,
    supportsSearch: true,
    supportsTools: true
  },
  'brok-reasoning': {
    name: 'Brok Reasoning',
    description: 'Advanced reasoning for complex problems',
    provider: 'minimax',
    providerModel: 'MiniMax-M2',
    inputCostPerMillion: 0.2,
    outputCostPerMillion: 0.8,
    maxTokens: MINIMAX_CONTEXT_WINDOW,
    contextWindow: MINIMAX_CONTEXT_WINDOW,
    supportsStreaming: true,
    supportsSearch: false,
    supportsTools: false
  },
  'MiniMax-M2.7': {
    name: 'MiniMax M2.7',
    description:
      'Beginning the journey of recursive self-improvement (output speed approximately 60 tps).',
    provider: 'minimax',
    providerModel: 'MiniMax-M2.7',
    inputCostPerMillion: 0.1,
    outputCostPerMillion: 0.4,
    maxTokens: MINIMAX_CONTEXT_WINDOW,
    contextWindow: MINIMAX_CONTEXT_WINDOW,
    supportsStreaming: true,
    supportsSearch: true,
    supportsTools: true,
    supportsCode: true
  },
  'MiniMax-M2.7-highspeed': {
    name: 'MiniMax M2.7 Highspeed',
    description:
      'M2.7 Highspeed: Same performance, faster and more agile (output speed approximately 100 tps).',
    provider: 'minimax',
    providerModel: 'MiniMax-M2.7-highspeed',
    inputCostPerMillion: 0.1,
    outputCostPerMillion: 0.4,
    maxTokens: MINIMAX_CONTEXT_WINDOW,
    contextWindow: MINIMAX_CONTEXT_WINDOW,
    supportsStreaming: true,
    supportsSearch: true,
    supportsTools: true,
    supportsCode: true
  },
  'MiniMax-M2.5': {
    name: 'MiniMax M2.5',
    description:
      'Peak Performance. Ultimate Value. Master the Complex (output speed approximately 60 tps).',
    provider: 'minimax',
    providerModel: 'MiniMax-M2.5',
    inputCostPerMillion: 0.1,
    outputCostPerMillion: 0.4,
    maxTokens: MINIMAX_CONTEXT_WINDOW,
    contextWindow: MINIMAX_CONTEXT_WINDOW,
    supportsStreaming: true,
    supportsSearch: true,
    supportsTools: true,
    supportsCode: true
  },
  'MiniMax-M2.5-highspeed': {
    name: 'MiniMax M2.5 Highspeed',
    description:
      'M2.5 highspeed: Same performance, faster and more agile (output speed approximately 100 tps).',
    provider: 'minimax',
    providerModel: 'MiniMax-M2.5-highspeed',
    inputCostPerMillion: 0.1,
    outputCostPerMillion: 0.4,
    maxTokens: MINIMAX_CONTEXT_WINDOW,
    contextWindow: MINIMAX_CONTEXT_WINDOW,
    supportsStreaming: true,
    supportsSearch: true,
    supportsTools: true,
    supportsCode: true
  },
  'MiniMax-M2.1': {
    name: 'MiniMax M2.1',
    description:
      'Powerful Multi-Language Programming Capabilities with Comprehensively Enhanced Programming Experience (output speed approximately 60 tps).',
    provider: 'minimax',
    providerModel: 'MiniMax-M2.1',
    inputCostPerMillion: 0.1,
    outputCostPerMillion: 0.4,
    maxTokens: MINIMAX_CONTEXT_WINDOW,
    contextWindow: MINIMAX_CONTEXT_WINDOW,
    supportsStreaming: true,
    supportsSearch: true,
    supportsTools: true,
    supportsCode: true
  },
  'MiniMax-M2.1-highspeed': {
    name: 'MiniMax M2.1 Highspeed',
    description: 'Faster and More Agile (output speed approximately 100 tps).',
    provider: 'minimax',
    providerModel: 'MiniMax-M2.1-highspeed',
    inputCostPerMillion: 0.1,
    outputCostPerMillion: 0.4,
    maxTokens: MINIMAX_CONTEXT_WINDOW,
    contextWindow: MINIMAX_CONTEXT_WINDOW,
    supportsStreaming: true,
    supportsSearch: true,
    supportsTools: true,
    supportsCode: true
  },
  'MiniMax-M2': {
    name: 'MiniMax M2',
    description: 'Agentic capabilities and advanced reasoning.',
    provider: 'minimax',
    providerModel: 'MiniMax-M2',
    inputCostPerMillion: 0.1,
    outputCostPerMillion: 0.4,
    maxTokens: MINIMAX_CONTEXT_WINDOW,
    contextWindow: MINIMAX_CONTEXT_WINDOW,
    supportsStreaming: true,
    supportsSearch: true,
    supportsTools: true,
    supportsCode: true
  }
}

export type BrokModelId = keyof typeof BROK_MODELS

export function isValidBrokModel(modelId: string): boolean {
  return modelId in BROK_MODELS
}

export function getBrokModel(modelId: string): BrokModelConfig | undefined {
  return BROK_MODELS[modelId]
}
