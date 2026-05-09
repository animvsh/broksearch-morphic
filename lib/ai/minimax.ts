/**
 * MiniMax AI Provider for the AI SDK
 *
 * Note: This requires @ai-sdk/openai-compatible to be installed:
 * bun add @ai-sdk/openai-compatible
 *
 * Until then, you can use the custom provider below or install the package.
 */

import { customProvider } from 'ai'

export const MINIMAX_MODEL = 'MiniMax-Text-01'
export const MINIMAX_CHAT_MODEL = 'abab6.5s-chat'

// Base URL for MiniMax API
export const MINIMAX_BASE_URL = 'https://api.minimax.chat/v1'

// Custom MiniMax provider using the AI SDK's customProvider
// This is a placeholder that will work once @ai-sdk/openai-compatible is installed
export const minimaxProvider = customProvider({
  languageModels: {
    [MINIMAX_MODEL]: { // eslint-disable-line @typescript-eslint/no-unused-vars
      languageModel: (modelId: string) => {
        // This will be replaced with actual implementation after installing @ai-sdk/openai-compatible
        throw new Error(
          `MiniMax provider not configured. Please install @ai-sdk/openai-compatible:\n` +
          `bun add @ai-sdk/openai-compatible\n\n` +
          `Then update this file to:\n` +
          `import { createOpenAICompatible } from '@ai-sdk/openai-compatible'\n` +
          `export const minimax = createOpenAICompatible({ baseURL: 'https://api.minimax.chat/v1' })`
        )
      }
    }
  }
})

// Re-export for convenience
export const minimax = minimaxProvider
