/**
 * MiniMax AI Provider
 *
 * This module exports constants and configuration for the MiniMax API.
 * The actual API calls use direct fetch in the route handlers.
 *
 * Note: For full AI SDK integration with MiniMax, install @ai-sdk/openai-compatible:
 * bun add @ai-sdk/openai-compatible
 *
 * Then update this file to use createOpenAICompatible:
 * import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
 * export const minimax = createOpenAICompatible({ baseURL: 'https://api.minimax.chat/v1' })
 */

export const MINIMAX_MODEL = 'MiniMax-Text-01'
export const MINIMAX_CHAT_MODEL = 'abab6.5s-chat'

// Base URL for MiniMax API
export const MINIMAX_BASE_URL = 'https://api.minimax.chat/v1'

// Re-export for convenience (compatibility with existing imports)
export const minimax = {
  languageModel: (modelId: string) => {
    throw new Error(
      `Direct AI SDK integration with MiniMax requires @ai-sdk/openai-compatible.\n` +
      `For now, use direct API calls via fetch to ${MINIMAX_BASE_URL}`
    )
  }
}
