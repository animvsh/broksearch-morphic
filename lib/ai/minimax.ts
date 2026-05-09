/**
 * MiniMax AI Provider
 *
 * Uses the OPENAI_COMPATIBLE_API_KEY and OPENAI_COMPATIBLE_API_BASE_URL
 * environment variables to configure the MiniMax OpenAI-compatible API.
 */

export const MINIMAX_MODEL = 'MiniMax-Text-01'
export const MINIMAX_CHAT_MODEL = 'abab6.5s-chat'

// Base URL for MiniMax API (OpenAI-compatible endpoint)
export const MINIMAX_BASE_URL =
  process.env.OPENAI_COMPATIBLE_API_BASE_URL || 'https://api.minimax.io/v1'

// API key
export const MINIMAX_API_KEY = process.env.OPENAI_COMPATIBLE_API_KEY || ''
