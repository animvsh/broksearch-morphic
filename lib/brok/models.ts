export interface BrokModelConfig {
  name: string;
  description: string;
  provider: string;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
  maxTokens: number;
  supportsSearch: boolean;
  supportsStreaming: boolean;
  supportsTools: boolean;
}

export const BROK_MODELS: Record<string, BrokModelConfig> = {
  'brok-search': {
    name: 'Brok Search',
    description: 'Search-optimized model with web search capabilities',
    provider: 'minimax',
    inputCostPerMillion: 0.10,
    outputCostPerMillion: 0.10,
    maxTokens: 16000,
    supportsSearch: true,
    supportsStreaming: true,
    supportsTools: false,
  },
  'brok-search-pro': {
    name: 'Brok Search Pro',
    description: 'Advanced search model with deeper analysis',
    provider: 'minimax',
    inputCostPerMillion: 0.20,
    outputCostPerMillion: 0.40,
    maxTokens: 32000,
    supportsSearch: true,
    supportsStreaming: true,
    supportsTools: false,
  },
  'brok-lite': {
    name: 'Brok Lite',
    description: 'Fast, efficient model for simple tasks',
    provider: 'minimax',
    inputCostPerMillion: 0.05,
    outputCostPerMillion: 0.05,
    maxTokens: 8000,
    supportsSearch: false,
    supportsStreaming: true,
    supportsTools: false,
  },
  'brok-standard': {
    name: 'Brok Standard',
    description: 'Balanced model for general use',
    provider: 'minimax',
    inputCostPerMillion: 0.10,
    outputCostPerMillion: 0.10,
    maxTokens: 16000,
    supportsSearch: false,
    supportsStreaming: true,
    supportsTools: true,
  },
  'brok-reasoning': {
    name: 'Brok Reasoning',
    description: 'Enhanced reasoning and analysis',
    provider: 'minimax',
    inputCostPerMillion: 0.20,
    outputCostPerMillion: 0.40,
    maxTokens: 32000,
    supportsSearch: false,
    supportsStreaming: true,
    supportsTools: true,
  },
};

export type BrokModelId = keyof typeof BROK_MODELS;

export function isValidBrokModel(modelId: string): boolean {
  return modelId in BROK_MODELS;
}

export function getBrokModel(modelId: string): BrokModelConfig | undefined {
  return BROK_MODELS[modelId];
}
