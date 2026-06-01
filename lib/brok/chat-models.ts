import { Model } from '@/lib/types/models'

const BROK_PROVIDER = 'Brok'
const BROK_PROVIDER_ID = 'openai-compatible'
const BROK_CONTEXT_WINDOW = 204_800

export const BROK_CHAT_MODELS: Model[] = [
  {
    id: 'brok-m2-7-highspeed',
    alias: 'brok-fast',
    name: 'Brok Fast',
    provider: BROK_PROVIDER,
    providerId: BROK_PROVIDER_ID,
    description:
      'Default fast route for everyday chat, search, and quick edits.',
    contextWindow: BROK_CONTEXT_WINDOW,
    speedLabel: 'about 100 tps'
  },
  {
    id: 'brok-m2-7',
    alias: 'brok-search',
    name: 'Brok Search',
    provider: BROK_PROVIDER,
    providerId: BROK_PROVIDER_ID,
    description:
      'Search-grounded reasoning for more careful long-context work.',
    contextWindow: BROK_CONTEXT_WINDOW,
    speedLabel: 'about 60 tps'
  },
  {
    id: 'brok-m2-5-highspeed',
    alias: 'brok-2.5-fast',
    name: 'Brok 2.5 Fast',
    provider: BROK_PROVIDER,
    providerId: BROK_PROVIDER_ID,
    description: 'M2.5 highspeed path for responsive complex work.',
    contextWindow: BROK_CONTEXT_WINDOW,
    speedLabel: 'about 100 tps'
  },
  {
    id: 'brok-m2-5',
    alias: 'brok-2.5',
    name: 'Brok 2.5',
    provider: BROK_PROVIDER,
    providerId: BROK_PROVIDER_ID,
    description: 'Peak performance and strong value for complex tasks.',
    contextWindow: BROK_CONTEXT_WINDOW,
    speedLabel: 'about 60 tps'
  },
  {
    id: 'brok-m2-1-highspeed',
    alias: 'brok-2.1-fast',
    name: 'Brok 2.1 Fast',
    provider: BROK_PROVIDER,
    providerId: BROK_PROVIDER_ID,
    description: 'Faster and more agile M2.1 route.',
    contextWindow: BROK_CONTEXT_WINDOW,
    speedLabel: 'about 100 tps'
  },
  {
    id: 'brok-m2-1',
    alias: 'brok-2.1',
    name: 'Brok 2.1',
    provider: BROK_PROVIDER,
    providerId: BROK_PROVIDER_ID,
    description:
      'Powerful multilingual programming capabilities with enhanced coding experience.',
    contextWindow: BROK_CONTEXT_WINDOW,
    speedLabel: 'about 60 tps'
  },
  {
    id: 'brok-m2',
    alias: 'brok-reasoning',
    name: 'Brok M2 Reasoning',
    provider: BROK_PROVIDER,
    providerId: BROK_PROVIDER_ID,
    description: 'Agentic capabilities and advanced reasoning.',
    contextWindow: BROK_CONTEXT_WINDOW,
    speedLabel: 'reasoning path'
  }
]

export function getBrokChatModel(modelId: string): Model | undefined {
  return BROK_CHAT_MODELS.find(model => model.id === modelId)
}
