import { NextResponse } from 'next/server'

import { desc, sql } from 'drizzle-orm'

import { requireAdminAccess } from '@/lib/auth/admin'
import { db } from '@/lib/db'
import { chats, featureRequests, feedback, messages } from '@/lib/db/schema'

async function getUsers() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    return []
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    headers: {
      Authorization: `Bearer ${supabaseServiceKey}`,
      apikey: supabaseServiceKey
    },
    cache: 'no-store'
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText)
  }

  const data = (await response.json()) as {
    users?: Array<{ id: string; email?: string }>
  }

  return data.users ?? []
}

export async function GET() {
  try {
    const admin = await requireAdminAccess()
    if (!admin.ok) {
      return NextResponse.json({ error: admin.error }, { status: admin.status })
    }

    const [
      users,
      [chatStats],
      [messageStats],
      [feedbackStats],
      [featureRequestStats],
      recentFeatureRequests
    ] = await Promise.all([
      getUsers(),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(chats)
        .limit(1),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(messages)
        .limit(1),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(feedback)
        .limit(1),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(featureRequests)
        .limit(1),
      db
        .select({
          id: featureRequests.id,
          userId: featureRequests.userId,
          accountEmail: featureRequests.accountEmail,
          request: featureRequests.request,
          pageUrl: featureRequests.pageUrl,
          status: featureRequests.status,
          createdAt: featureRequests.createdAt
        })
        .from(featureRequests)
        .orderBy(desc(featureRequests.createdAt))
        .limit(25)
    ])

    return NextResponse.json({
      users,
      featureRequests: recentFeatureRequests,
      stats: {
        total_chats: chatStats?.count ?? 0,
        total_messages: messageStats?.count ?? 0,
        active_users: users.length,
        total_feedback: feedbackStats?.count ?? 0,
        total_feature_requests: featureRequestStats?.count ?? 0
      }
    })
  } catch (error) {
    console.error('Admin API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
