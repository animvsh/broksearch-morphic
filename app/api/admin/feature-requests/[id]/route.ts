import { NextRequest, NextResponse } from 'next/server'

import { eq } from 'drizzle-orm'

import { requireAdminAccess } from '@/lib/auth/admin'
import { db } from '@/lib/db'
import { featureRequests } from '@/lib/db/schema'

const ALLOWED_STATUSES = new Set(['open', 'reviewed', 'closed'])

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminAccess()
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status })
  }

  const { id } = await params
  const body = await request.json().catch(() => null)
  const status = typeof body?.status === 'string' ? body.status : null

  if (!status || !ALLOWED_STATUSES.has(status)) {
    return NextResponse.json(
      { error: 'Feature request status must be open, reviewed, or closed.' },
      { status: 400 }
    )
  }

  const [updated] = await db
    .update(featureRequests)
    .set({ status: status as 'open' | 'reviewed' | 'closed' })
    .where(eq(featureRequests.id, id))
    .returning({
      id: featureRequests.id,
      userId: featureRequests.userId,
      accountEmail: featureRequests.accountEmail,
      request: featureRequests.request,
      pageUrl: featureRequests.pageUrl,
      status: featureRequests.status,
      createdAt: featureRequests.createdAt
    })

  if (!updated) {
    return NextResponse.json(
      { error: 'Feature request not found.' },
      { status: 404 }
    )
  }

  return NextResponse.json({ featureRequest: updated })
}
