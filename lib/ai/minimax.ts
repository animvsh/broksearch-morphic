import { createOpenAICompatible } from '@ai-sdk/openai-compatible'

export const minimax = createOpenAICompatible({
  baseURL: 'https://api.minimax.chat/v1'
})

export const MINIMAX_MODEL = 'MiniMax-Text-01'
export const MINIMAX_CHAT_MODEL = 'abab6.5s-chat'

export const minimaxProvider = minimax as any
