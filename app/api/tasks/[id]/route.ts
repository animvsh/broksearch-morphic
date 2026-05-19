import { NextResponse } from 'next/server'

import { requireFeatureAccessForApi } from '@/lib/auth/app-access'
import { getBackgroundTask } from '@/lib/tasks/background-tasks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireFeatureAccessForApi('search')
  if (!access.ok) return access.response

  const { id } = await params
  const task = await getBackgroundTask({ userId: access.user.id, id })
  if (!task) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ task })
}
