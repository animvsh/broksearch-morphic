/**
 * Centralized pricing rules for the Brok developer API.
 *
 * All v1 routes (chat, search, code) read from this module so that a markup
 * change is a single edit rather than a cross-repo find-and-replace.
 */

export const BROK_BILLING_MARKUP = 1.5

export const SEARCH_BILLING = {
  perQueryUsd: 0.001,
  perMillionInputTokensUsd: 0.1
}

export function calculateSearchProviderCostUsd(
  searchQueries: number,
  inputTokens: number
): number {
  const queryCost = SEARCH_BILLING.perQueryUsd * searchQueries
  const tokenCost =
    (inputTokens / 1_000_000) * SEARCH_BILLING.perMillionInputTokensUsd
  return queryCost + tokenCost
}

export function applyBrokMarkup(providerCostUsd: number): number {
  return providerCostUsd * BROK_BILLING_MARKUP
}
