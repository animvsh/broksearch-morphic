import { NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/get-current-user'
import { listBackgroundTasks } from '@/lib/tasks/background-tasks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const limit = Math.min(
    Math.max(Number.parseInt(url.searchParams.get('limit') || '20', 10), 1),
    100
  )

  const tasks = await listBackgroundTasks({ userId: user.id, limit })
  return NextResponse.json({ tasks })
}
