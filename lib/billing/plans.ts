/**
 * Plan pricing and entitlements for the admin billing surface.
 *
 * Kept out of the `'use server'` actions file because Server Action modules
 * can only export async functions per the Next.js App Router contract:
 * https://nextjs.org/docs/messages/invalid-use-server-value
 */

export const PLAN_MONTHLY_PRICE_CENTS: Record<string, number> = {
  free: 0,
  starter: 1900,
  pro: 4900,
  team: 14900,
  scale: 49900,
  enterprise: 199900
}

export const PLAN_INCLUDED_USD: Record<string, number> = {
  free: 0,
  starter: 5,
  pro: 25,
  team: 100,
  scale: 500,
  enterprise: 2500
}

export type BillingStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'failed'
