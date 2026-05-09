import { BROK_MODELS, BrokModelId, getBrokModel } from './models';

export interface ProviderRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
  tools?: Array<{
    type: string;
    web_search?: {
      top_n?: number;
    };
  }>;
  toolChoice?: {
    type: string;
    web_search?: {
      top_n?: number;
    };
  };
}

export interface ProviderResponse {
  id: string;
  model: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
      tool_calls?: Array<{
        id: string;
        type: string;
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  citations?: Array<{
    title?: string;
    url: string;
    publisher?: string;
    snippet?: string;
  }>;
}

export async function routeToProvider(
  model: BrokModelId,
  request: ProviderRequest
): Promise<ProviderResponse> {
  const modelConfig = BROK_MODELS[model];

  if (!modelConfig) {
    throw new Error(`Unknown model: ${model}`);
  }

  // Transform request to provider format
  const providerRequest = transformToProviderRequest(model, request);

  // Call appropriate provider
  const providerApiKey = process.env.MINIMAX_API_KEY;

  if (!providerApiKey) {
    throw new Error('Provider API key not configured');
  }

  const response = await fetch('https://api.minimax.chat/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${providerApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(providerRequest),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Provider error: ${response.status} - ${error}`);
  }

  return response.json();
}

function transformToProviderRequest(
  model: BrokModelId,
  request: ProviderRequest
) {
  const modelConfig = BROK_MODELS[model];

  const providerRequest: Record<string, unknown> = {
    model: modelConfig.providerModel,
    messages: request.messages,
    stream: request.stream,
    temperature: request.temperature,
    max_tokens: request.maxTokens,
  };

  // Add web search tools if supported and requested
  if (request.tools && modelConfig.supportsTools) {
    providerRequest.tools = request.tools;
    if (request.toolChoice) {
      providerRequest.tool_choice = request.toolChoice;
    }
  }

  return providerRequest;
}

export function calculateCost(
  model: BrokModelId,
  inputTokens: number,
  outputTokens: number
): number {
  const config = BROK_MODELS[model];
  if (!config) return 0;
  const inputCost = (inputTokens / 1_000_000) * config.inputCostPerMillion;
  const outputCost = (outputTokens / 1_000_000) * config.outputCostPerMillion;
  return inputCost + outputCost;
}