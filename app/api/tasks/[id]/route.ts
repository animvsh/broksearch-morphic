import { NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getBackgroundTask } from '@/lib/tasks/background-tasks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const task = await getBackgroundTask({ userId: user.id, id })
  if (!task) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ task })
}
