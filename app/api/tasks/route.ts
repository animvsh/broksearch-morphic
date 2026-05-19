import { NextResponse } from 'next/server'

import { requireFeatureAccessForApi } from '@/lib/auth/app-access'
import { listBackgroundTasks } from '@/lib/tasks/background-tasks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const access = await requireFeatureAccessForApi('search')
  if (!access.ok) return access.response

  const url = new URL(request.url)
  const limit = Math.min(
    Math.max(Number.parseInt(url.searchParams.get('limit') || '20', 10), 1),
    100
  )
  const chatId = url.searchParams.get('chatId')?.trim() || null

  const tasks = await listBackgroundTasks({
    userId: access.user.id,
    limit,
    chatId
  })
  return NextResponse.json({ tasks })
}
