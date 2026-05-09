import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestAuth, unauthorizedResponse } from '@/lib/brok/auth';
import { db } from '@/lib/db';
import { usageEvents } from '@/lib/db/schema-brok';
import { eq, and, gte, sql } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  const auth = await verifyRequestAuth(request);
  if (!auth.success) {
    return unauthorizedResponse(auth);
  }

  const searchParams = request.nextUrl.searchParams;
  const period = searchParams.get('period') || 'month';

  let dateFrom = new Date();
  if (period === 'day') {
    dateFrom.setHours(0, 0, 0, 0);
  } else if (period === 'week') {
    dateFrom.setDate(dateFrom.getDate() - 7);
  } else if (period === 'month') {
    dateFrom.setMonth(dateFrom.getMonth() - 1);
  }

  const usage = await db
    .select({
      totalRequests: sql<number>`count(*)`,
      totalInputTokens: sql<number>`sum(${usageEvents.inputTokens})`,
      totalOutputTokens: sql<number>`sum(${usageEvents.outputTokens})`,
      totalCachedTokens: sql<number>`sum(${usageEvents.cachedTokens})`,
      totalSearchQueries: sql<number>`sum(${usageEvents.searchQueries})`,
      totalBilled: sql<number>`sum(${usageEvents.billedUsd})`,
    })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.workspaceId, auth.workspace.id),
        gte(usageEvents.createdAt, dateFrom)
      )
    );

  const [stats] = usage;

  return NextResponse.json({
    period,
    usage: {
      requests: Number(stats?.totalRequests) || 0,
      input_tokens: Number(stats?.totalInputTokens) || 0,
      output_tokens: Number(stats?.totalOutputTokens) || 0,
      cached_tokens: Number(stats?.totalCachedTokens) || 0,
      search_queries: Number(stats?.totalSearchQueries) || 0,
      billed_usd: Number(stats?.totalBilled) || 0,
    },
  });
}
