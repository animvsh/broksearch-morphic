import { and, eq, gte } from 'drizzle-orm'

import { db } from '@/lib/db'
import { rateLimitEvents } from '@/lib/db/schema-brok'

export interface RateLimitResult {
  allowed: boolean
  current: number
  limit: number
  resetAt: number // Unix timestamp
}

export interface RateLimitConfig {
  rpm: number
  rph?: number // requests per hour
  rpd?: number // requests per day
}

/**
 * Check and enforce rate limit for an API key.
 * Uses a sliding window approach based on the rpm (requests per minute) limit.
 */
export async function checkRateLimit(
  apiKeyId: string,
  workspaceId: string,
  rpmLimit: number
): Promise<RateLimitResult> {
  const now = Date.now()
  const windowMs = 60 * 1000 // 1 minute window
  const windowStart = new Date(now - windowMs)

  try {
    // Count accepted requests in the current window. Blocked attempts are still
    // recorded for observability, but they should not extend the lockout window.
    const result = await db
      .select({ count: rateLimitEvents.id })
      .from(rateLimitEvents)
      .where(
        and(
          eq(rateLimitEvents.apiKeyId, apiKeyId),
          eq(rateLimitEvents.blocked, false),
          gte(rateLimitEvents.createdAt, windowStart)
        )
      )

    const currentCount = result.length
    const allowed = currentCount < rpmLimit
    const resetAt = Math.floor((now + windowMs) / 1000) // Unix timestamp

    return {
      allowed,
      current: currentCount,
      limit: rpmLimit,
      resetAt
    }
  } catch (error) {
    console.error('Rate limit check error:', error)
    // Fail open - allow the request if we can't check
    return {
      allowed: true,
      current: 0,
      limit: rpmLimit,
      resetAt: Math.floor((now + 60000) / 1000)
    }
  }
}

/**
 * Record a rate limit event (for tracking purposes).
 */
export async function recordRateLimitEvent(
  apiKeyId: string,
  workspaceId: string,
  limitType: string,
  limitValue: number,
  currentValue: number,
  blocked: boolean
): Promise<void> {
  try {
    await db.insert(rateLimitEvents).values({
      workspaceId,
      apiKeyId,
      limitType,
      limitValue,
      currentValue,
      blocked
    })
  } catch (error) {
    console.error('Failed to record rate limit event:', error)
  }
}
