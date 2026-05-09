export interface BrokModelConfig {
  name: string;
  description: string;
  provider: string;
  providerModel: string;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
  maxTokens: number;
  supportsSearch: boolean;
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsCode?: boolean;
}

export const BROK_MODELS: Record<string, BrokModelConfig> = {
  'brok-lite': {
    name: 'Brok Lite',
    description: 'Fast, low-cost reasoning for simple tasks',
    provider: 'minimax',
    providerModel: 'minimax-m2.7',
    inputCostPerMillion: 0.10,
    outputCostPerMillion: 0.40,
    maxTokens: 16000,
    supportsStreaming: true,
    supportsSearch: false,
    supportsTools: false,
  },
  'brok-search': {
    name: 'Brok Search',
    description: 'Search-powered answers with citations using MiniMax native web search',
    provider: 'minimax',
    providerModel: 'minimax-text',
    inputCostPerMillion: 0.10,
    outputCostPerMillion: 0.40,
    maxTokens: 16000,
    supportsStreaming: true,
    supportsSearch: true,
    supportsTools: true,
  },
  'brok-search-pro': {
    name: 'Brok Search Pro',
    description: 'Deep search with 10-20 sources using MiniMax native web search',
    provider: 'minimax',
    providerModel: 'minimax-text',
    inputCostPerMillion: 0.15,
    outputCostPerMillion: 0.60,
    maxTokens: 32000,
    supportsStreaming: true,
    supportsSearch: true,
    supportsTools: true,
  },
  'brok-code': {
    name: 'Brok Code',
    description: 'Code understanding and generation',
    provider: 'minimax',
    providerModel: 'minimax-code',
    inputCostPerMillion: 0.10,
    outputCostPerMillion: 0.40,
    maxTokens: 16000,
    supportsStreaming: true,
    supportsSearch: false,
    supportsTools: false,
    supportsCode: true,
  },
  'brok-agent': {
    name: 'Brok Agent',
    description: 'Tool-using agent with browser and search',
    provider: 'minimax',
    providerModel: 'minimax-agent',
    inputCostPerMillion: 0.15,
    outputCostPerMillion: 0.60,
    maxTokens: 32000,
    supportsStreaming: true,
    supportsSearch: true,
    supportsTools: true,
  },
  'brok-reasoning': {
    name: 'Brok Reasoning',
    description: 'Advanced reasoning for complex problems',
    provider: 'minimax',
    providerModel: 'minimax-reasoning',
    inputCostPerMillion: 0.20,
    outputCostPerMillion: 0.80,
    maxTokens: 32000,
    supportsStreaming: true,
    supportsSearch: false,
    supportsTools: false,
  },
};

export type BrokModelId = keyof typeof BROK_MODELS;

export function isValidBrokModel(modelId: string): boolean {
  return modelId in BROK_MODELS;
}

export function getBrokModel(modelId: string): BrokModelConfig | undefined {
  return BROK_MODELS[modelId];
}
