/**
 * OpenAI-compatible Brok provider settings.
 */

export const MINIMAX_MODEL = process.env.BROK_PROVIDER_MODEL || 'MiniMax-M2.7'
export const MINIMAX_CHAT_MODEL = MINIMAX_MODEL

export const MINIMAX_BASE_URL =
  process.env.OPENAI_COMPATIBLE_API_BASE_URL || 'https://api.minimax.io/v1'

export const MINIMAX_API_KEY = process.env.OPENAI_COMPATIBLE_API_KEY || ''
