import { NextRequest, NextResponse } from 'next/server'

import { and, eq, gte, sql } from 'drizzle-orm'

import { unauthorizedResponse, verifyRequestAuth } from '@/lib/brok/auth'
import { db } from '@/lib/db'
import { usageEvents } from '@/lib/db/schema-brok'

export async function GET(request: NextRequest) {
  const auth = await verifyRequestAuth(request)
  if (!auth.success) {
    return unauthorizedResponse(auth)
  }

  const searchParams = request.nextUrl.searchParams
  const period = searchParams.get('period') || 'month'

  let dateFrom = new Date()
  if (period === 'day') {
    dateFrom.setHours(0, 0, 0, 0)
  } else if (period === 'week') {
    dateFrom.setDate(dateFrom.getDate() - 7)
  } else if (period === 'month') {
    dateFrom.setMonth(dateFrom.getMonth() - 1)
  }

  let stats:
    | {
        totalRequests: number
        totalInputTokens: number
        totalOutputTokens: number
        totalCachedTokens: number
        totalSearchQueries: number
        totalBilled: number
      }
    | undefined

  try {
    ;[stats] = await db
      .select({
        totalRequests: sql<number>`count(*)`,
        totalInputTokens: sql<number>`sum(${usageEvents.inputTokens})`,
        totalOutputTokens: sql<number>`sum(${usageEvents.outputTokens})`,
        totalCachedTokens: sql<number>`sum(${usageEvents.cachedTokens})`,
        totalSearchQueries: sql<number>`sum(${usageEvents.searchQueries})`,
        totalBilled: sql<number>`sum(${usageEvents.billedUsd})`
      })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.workspaceId, auth.workspace.id),
          gte(usageEvents.createdAt, dateFrom)
        )
      )
  } catch {
    if (auth.apiKey.id === '00000000-0000-0000-0000-000000000001') {
      return NextResponse.json(
        {
          period,
          usage: {
            requests: 0,
            input_tokens: 0,
            output_tokens: 0,
            cached_tokens: 0,
            search_queries: 0,
            billed_usd: 0
          }
        },
        {
          headers: {
            'x-brok-degraded': 'local-usage-storage-unavailable'
          }
        }
      )
    }

    return NextResponse.json(
      {
        error: {
          type: 'service_unavailable',
          message:
            'Usage storage is unavailable. Check the database connection and try again.'
        }
      },
      { status: 503 }
    )
  }

  return NextResponse.json({
    period,
    usage: {
      requests: Number(stats?.totalRequests) || 0,
      input_tokens: Number(stats?.totalInputTokens) || 0,
      output_tokens: Number(stats?.totalOutputTokens) || 0,
      cached_tokens: Number(stats?.totalCachedTokens) || 0,
      search_queries: Number(stats?.totalSearchQueries) || 0,
      billed_usd: Number(stats?.totalBilled) || 0
    }
  })
}
