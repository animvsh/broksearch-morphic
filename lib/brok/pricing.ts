/**
 * Brok pricing utilities.
 *
 * Centralises cost calculations for the search pipeline so route handlers can
 * share a single source of truth instead of duplicating the formula.
 *
 * Rates are expressed in USD. Defaults reflect the public search pricing
 * model used prior to the /api-platform/* consolidation and can be overridden
 * through environment variables for self-hosted deployments.
 */

const DEFAULT_SEARCH_COST_PER_QUERY_USD = 0.001
const DEFAULT_TOKEN_COST_PER_MILLION_USD = 0.1
const DEFAULT_BROK_MARKUP = 1.5

function readPositiveNumber(envName: string, fallback: number): number {
  const raw = process.env[envName]
  if (!raw) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

function searchCostPerQueryUsd() {
  return readPositiveNumber(
    'BROK_SEARCH_COST_PER_QUERY_USD',
    DEFAULT_SEARCH_COST_PER_QUERY_USD
  )
}

function tokenCostPerMillionUsd() {
  return readPositiveNumber(
    'BROK_TOKEN_COST_PER_MILLION_USD',
    DEFAULT_TOKEN_COST_PER_MILLION_USD
  )
}

function brokMarkupMultiplier() {
  return readPositiveNumber('BROK_MARKUP_MULTIPLIER', DEFAULT_BROK_MARKUP)
}

/**
 * Calculate the upstream (provider) cost of a search request in USD.
 *
 * Formula: (queries * $0.001) + (tokensUsed / 1_000_000 * $0.1)
 */
export function calculateSearchProviderCostUsd(
  searchQueries: number,
  tokensUsed: number
): number {
  const safeQueries = Math.max(0, Math.floor(searchQueries ?? 0))
  const safeTokens = Math.max(0, Math.floor(tokensUsed ?? 0))

  const queryCost = safeQueries * searchCostPerQueryUsd()
  const tokenCost = (safeTokens / 1_000_000) * tokenCostPerMillionUsd()

  return queryCost + tokenCost
}

/**
 * Apply the Brok markup (default 1.5x) to a provider cost to get the billed
 * amount in USD. Markups of 1.0 or below disable the markup entirely so
 * internal tools can record passthrough pricing.
 */
export function applyBrokMarkup(providerCostUsd: number): number {
  const safeCost = Math.max(0, providerCostUsd ?? 0)
  const markup = brokMarkupMultiplier()
  if (markup <= 1) return safeCost
  return safeCost * markup
}
