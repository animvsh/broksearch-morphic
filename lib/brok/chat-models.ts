import { Model } from '@/lib/types/models'

const BROK_PROVIDER = 'Brok'
const BROK_PROVIDER_ID = 'openai-compatible'
const MINIMAX_CONTEXT_WINDOW = 204_800

export const BROK_CHAT_MODELS: Model[] = [
  {
    id: 'MiniMax-M2.7-highspeed',
    name: 'Brok 3 Fast',
    provider: BROK_PROVIDER,
    providerId: BROK_PROVIDER_ID,
    description: 'M2.7 Highspeed: same performance, faster and more agile.',
    contextWindow: MINIMAX_CONTEXT_WINDOW,
    speedLabel: 'about 100 tps'
  },
  {
    id: 'MiniMax-M2.7',
    name: 'Brok 3',
    provider: BROK_PROVIDER,
    providerId: BROK_PROVIDER_ID,
    description: 'M2.7 reasoning for complex long-context work.',
    contextWindow: MINIMAX_CONTEXT_WINDOW,
    speedLabel: 'about 60 tps'
  },
  {
    id: 'MiniMax-M2.5-highspeed',
    name: 'Brok 2.5 Fast',
    provider: BROK_PROVIDER,
    providerId: BROK_PROVIDER_ID,
    description: 'M2.5 highspeed path for responsive complex work.',
    contextWindow: MINIMAX_CONTEXT_WINDOW,
    speedLabel: 'about 100 tps'
  },
  {
    id: 'MiniMax-M2.5',
    name: 'Brok 2.5',
    provider: BROK_PROVIDER,
    providerId: BROK_PROVIDER_ID,
    description: 'Peak performance and strong value for complex tasks.',
    contextWindow: MINIMAX_CONTEXT_WINDOW,
    speedLabel: 'about 60 tps'
  },
  {
    id: 'MiniMax-M2.1-highspeed',
    name: 'Brok 2.1 Fast',
    provider: BROK_PROVIDER,
    providerId: BROK_PROVIDER_ID,
    description: 'Faster and more agile M2.1 route.',
    contextWindow: MINIMAX_CONTEXT_WINDOW,
    speedLabel: 'about 100 tps'
  },
  {
    id: 'MiniMax-M2.1',
    name: 'Brok 2.1',
    provider: BROK_PROVIDER,
    providerId: BROK_PROVIDER_ID,
    description:
      'Powerful multilingual programming capabilities with enhanced coding experience.',
    contextWindow: MINIMAX_CONTEXT_WINDOW,
    speedLabel: 'about 60 tps'
  },
  {
    id: 'MiniMax-M2',
    name: 'Brok M2 Reasoning',
    provider: BROK_PROVIDER,
    providerId: BROK_PROVIDER_ID,
    description: 'Agentic capabilities and advanced reasoning.',
    contextWindow: MINIMAX_CONTEXT_WINDOW,
    speedLabel: 'reasoning path'
  }
]

export function getBrokChatModel(modelId: string): Model | undefined {
  return BROK_CHAT_MODELS.find(model => model.id === modelId)
}
