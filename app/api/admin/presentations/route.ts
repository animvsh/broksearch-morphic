import { NextRequest, NextResponse } from 'next/server'

import { and, desc, eq, gte, ilike, sql } from 'drizzle-orm'

import { requireAdminAccess } from '@/lib/auth/admin'
import { db } from '@/lib/db'
import {
  presentationAssets,
  presentationExports,
  presentationGenerations,
  presentations,
  presentationSlides
} from '@/lib/presentations/schema'

function centsToDollars(cents: number | null | undefined): number {
  return (cents ?? 0) / 100
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')

  try {
    const admin = await requireAdminAccess()
    if (!admin.ok) {
      return NextResponse.json({ error: admin.error }, { status: admin.status })
    }

    if (type === 'stats') {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const sevenDaysAgo = new Date(today)
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)

      const [
        [presentationsToday],
        [slidesGeneratedToday],
        [exportsToday],
        [costRow],
        activityRows
      ] = await Promise.all([
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(presentations)
          .where(gte(presentations.createdAt, today))
          .limit(1),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(presentationSlides)
          .where(gte(presentationSlides.createdAt, today))
          .limit(1),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(presentationExports)
          .where(gte(presentationExports.createdAt, today))
          .limit(1),
        db
          .select({
            totalCents: sql<number>`coalesce(sum(${presentationGenerations.costUsd}), 0)::int`
          })
          .from(presentationGenerations)
          .where(gte(presentationGenerations.createdAt, today))
          .limit(1),
        db
          .select({
            date: sql<string>`to_char(${presentations.createdAt}, 'YYYY-MM-DD')`,
            count: sql<number>`count(*)::int`
          })
          .from(presentations)
          .where(gte(presentations.createdAt, sevenDaysAgo))
          .groupBy(sql`to_char(${presentations.createdAt}, 'YYYY-MM-DD')`)
      ])

      const activityByDate = new Map(
        activityRows.map(row => [row.date, row.count])
      )
      const recentActivity = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(sevenDaysAgo)
        date.setDate(sevenDaysAgo.getDate() + index)
        const key = date.toISOString().slice(0, 10)
        return {
          date: key,
          count: activityByDate.get(key) ?? 0
        }
      })

      return NextResponse.json({
        presentationsToday: presentationsToday?.count ?? 0,
        slidesGeneratedToday: slidesGeneratedToday?.count ?? 0,
        exportsToday: exportsToday?.count ?? 0,
        generationCost: centsToDollars(costRow?.totalCents).toFixed(2),
        recentActivity
      })
    }

    if (type === 'decks') {
      const page = Number.parseInt(searchParams.get('page') || '1', 10)
      const limit = Number.parseInt(searchParams.get('limit') || '20', 10)
      const offset = (page - 1) * limit
      const search = searchParams.get('search')
      const status = searchParams.get('status')

      const conditions = []

      if (search) {
        conditions.push(ilike(presentations.title, `%${search}%`))
      }

      if (status) {
        conditions.push(eq(presentations.status, status as any))
      }

      const deckQuery = db
        .select({
          id: presentations.id,
          title: presentations.title,
          user_id: presentations.userId,
          status: presentations.status,
          slide_count: presentations.slideCount,
          theme_id: presentations.themeId,
          created_at: presentations.createdAt,
          updated_at: presentations.updatedAt
        })
        .from(presentations)

      const countQuery = db
        .select({ count: sql<number>`count(*)::int` })
        .from(presentations)

      const [decks, [totalRow]] =
        conditions.length > 0
          ? await Promise.all([
              deckQuery
                .where(and(...conditions))
                .orderBy(desc(presentations.createdAt))
                .limit(limit)
                .offset(offset),
              countQuery.where(and(...conditions)).limit(1)
            ])
          : await Promise.all([
              deckQuery
                .orderBy(desc(presentations.createdAt))
                .limit(limit)
                .offset(offset),
              countQuery.limit(1)
            ])

      return NextResponse.json({
        decks,
        total: totalRow?.count ?? 0,
        page,
        limit
      })
    }

    if (type === 'generations') {
      const page = Number.parseInt(searchParams.get('page') || '1', 10)
      const limit = Number.parseInt(searchParams.get('limit') || '20', 10)
      const offset = (page - 1) * limit

      const [generations, [totalRow]] = await Promise.all([
        db
          .select({
            id: presentationGenerations.id,
            presentation_id: presentationGenerations.presentationId,
            user_id: presentationGenerations.userId,
            prompt: presentationGenerations.prompt,
            generation_type: presentationGenerations.generationType,
            model: presentationGenerations.model,
            web_search_enabled: presentationGenerations.webSearchEnabled,
            input_tokens: presentationGenerations.inputTokens,
            output_tokens: presentationGenerations.outputTokens,
            cost_usd: presentationGenerations.costUsd,
            status: presentationGenerations.status,
            created_at: presentationGenerations.createdAt
          })
          .from(presentationGenerations)
          .orderBy(desc(presentationGenerations.createdAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(presentationGenerations)
          .limit(1)
      ])

      return NextResponse.json({
        generations,
        total: totalRow?.count ?? 0,
        page,
        limit
      })
    }

    if (type === 'costs') {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const sevenDaysAgo = new Date(today)
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)

      const [
        generationRows,
        assetCountRow,
        exportCountRow,
        deckCountRow,
        dailyCostRows
      ] = await Promise.all([
        db
          .select({
            generation_type: presentationGenerations.generationType,
            web_search_enabled: presentationGenerations.webSearchEnabled,
            cost_usd: presentationGenerations.costUsd
          })
          .from(presentationGenerations),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(presentationAssets)
          .limit(1),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(presentationExports)
          .limit(1),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(presentations)
          .limit(1),
        db
          .select({
            date: sql<string>`to_char(${presentationGenerations.createdAt}, 'YYYY-MM-DD')`,
            totalCents: sql<number>`coalesce(sum(${presentationGenerations.costUsd}), 0)::int`
          })
          .from(presentationGenerations)
          .where(gte(presentationGenerations.createdAt, sevenDaysAgo))
          .groupBy(
            sql`to_char(${presentationGenerations.createdAt}, 'YYYY-MM-DD')`
          )
      ])

      const textGeneration = centsToDollars(
        generationRows
          .filter(
            row =>
              row.generation_type === 'outline' ||
              row.generation_type === 'edit'
          )
          .reduce((sum, row) => sum + row.cost_usd, 0)
      )

      const imageGeneration = centsToDollars(
        generationRows
          .filter(row => row.generation_type === 'slides')
          .reduce((sum, row) => sum + row.cost_usd, 0)
      )

      const webSearch = centsToDollars(
        generationRows
          .filter(row => row.web_search_enabled)
          .reduce((sum, row) => sum + row.cost_usd, 0)
      )

      const storage =
        ((assetCountRow[0]?.count ?? 0) + (exportCountRow[0]?.count ?? 0)) *
        0.01
      const dailyCostByDate = new Map(
        dailyCostRows.map(row => [row.date, centsToDollars(row.totalCents)])
      )
      const dailyCosts = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(sevenDaysAgo)
        date.setDate(sevenDaysAgo.getDate() + index)
        const key = date.toISOString().slice(0, 10)
        return {
          date: key,
          amount: dailyCostByDate.get(key) ?? 0
        }
      })

      return NextResponse.json({
        textGeneration,
        imageGeneration,
        webSearch,
        storage,
        deckCount: deckCountRow[0]?.count ?? 0,
        dailyCosts
      })
    }

    if (type === 'flagged') {
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const flaggedByGeneration = await db
        .select({
          id: presentations.id,
          title: presentations.title,
          user_id: presentations.userId,
          status: presentations.status,
          slide_count: presentations.slideCount,
          created_at: presentations.createdAt,
          reason: sql<string>`concat('Too many generations (', count(${presentationGenerations.id}), ' today)')`
        })
        .from(presentations)
        .innerJoin(
          presentationGenerations,
          eq(presentationGenerations.presentationId, presentations.id)
        )
        .where(gte(presentationGenerations.createdAt, today))
        .groupBy(
          presentations.id,
          presentations.title,
          presentations.userId,
          presentations.status,
          presentations.slideCount,
          presentations.createdAt
        )
        .having(sql`count(${presentationGenerations.id}) > 50`)

      const flaggedBySize = await db
        .select({
          id: presentations.id,
          title: presentations.title,
          user_id: presentations.userId,
          status: presentations.status,
          slide_count: presentations.slideCount,
          created_at: presentations.createdAt,
          reason: sql<string>`'Huge deck (' || ${presentations.slideCount} || ' slides)'`
        })
        .from(presentations)
        .where(gte(presentations.slideCount, 101))

      const flaggedMap = new Map<
        string,
        {
          id: string
          title: string
          user_id: string
          status: string
          slide_count: number
          created_at: Date
          reason: string
        }
      >()

      for (const row of [...flaggedByGeneration, ...flaggedBySize]) {
        flaggedMap.set(row.id, row)
      }

      return NextResponse.json({
        flagged: [...flaggedMap.values()].sort(
          (a, b) => b.created_at.getTime() - a.created_at.getTime()
        )
      })
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  } catch (error) {
    console.error('Admin presentations API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
