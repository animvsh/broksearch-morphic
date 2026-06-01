import { and, eq, gte } from 'drizzle-orm'

import { db } from '@/lib/db'
import { rateLimitEvents } from '@/lib/db/schema-brok'

export interface RateLimitResult {
  allowed: boolean
  current: number
  limit: number
  resetAt: number // Unix timestamp
  reason?: 'over_limit' | 'rate_limit_check_failed'
}

export interface RateLimitConfig {
  rpm: number
  rph?: number // requests per hour
  rpd?: number // requests per day
}

function isCloudDeployment() {
  return process.env.BROK_CLOUD_DEPLOYMENT === 'true'
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
  const resetAt = Math.floor((now + windowMs) / 1000) // Unix timestamp

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

    return {
      allowed,
      current: currentCount,
      limit: rpmLimit,
      resetAt
    }
  } catch (error) {
    console.error('Rate limit check error:', error)
    if (isCloudDeployment()) {
      // Fail closed in cloud: a database error must not allow unlimited traffic.
      return {
        allowed: false,
        current: 0,
        limit: rpmLimit,
        resetAt,
        reason: 'rate_limit_check_failed'
      }
    }
    // Self-hosted: fail open to keep the platform usable when the DB is
    // temporarily unavailable. Self-hosters are expected to enforce
    // network-level limits independently.
    return {
      allowed: true,
      current: 0,
      limit: rpmLimit,
      resetAt
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

