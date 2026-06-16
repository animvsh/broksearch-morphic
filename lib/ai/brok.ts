/**
 * OpenAI-compatible Brok provider settings.
 *
 * The upstream API at api.minimax.io expects the `MiniMax-M2.*` model IDs;
 * the `BROK_PROVIDER_*` constants in this file are the Brok-side names that
 * map to those upstream IDs. Environment variable names are preserved for
 * backwards compatibility with existing deployments.
 */

export const BROK_PROVIDER_MODEL =
  process.env.BROK_PROVIDER_MODEL || 'MiniMax-M2.7-highspeed'
export const BROK_PROVIDER_CHAT_MODEL = BROK_PROVIDER_MODEL

export const BROK_PROVIDER_BASE_URL =
  process.env.OPENAI_COMPATIBLE_API_BASE_URL || 'https://api.minimax.io/v1'

export const BROK_PROVIDER_API_KEY =
  process.env.OPENAI_COMPATIBLE_API_KEY ||
  process.env.BROK_PROVIDER_API_KEY ||
  process.env.MINIMAX_API_KEY ||
  ''
