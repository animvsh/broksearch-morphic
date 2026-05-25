import { NextResponse } from 'next/server'

import {
  hasFeatureAccess,
  requireAnyFeatureAccessForApi
} from '@/lib/auth/app-access'
import { reconcileStaleBrokCodeTask } from '@/lib/brokcode/durable-job'
import { listBackgroundTasks } from '@/lib/tasks/background-tasks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const access = await requireAnyFeatureAccessForApi(['search', 'brokcode'])
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
  const reconciledTasks = await Promise.all(
    tasks.map(task =>
      task.kind === 'brokcode'
        ? reconcileStaleBrokCodeTask({ task })
        : Promise.resolve(task)
    )
  )
  const visibleTasks = hasFeatureAccess(access.access, 'search')
    ? reconciledTasks
    : reconciledTasks.filter(task => task.kind === 'brokcode')

  return NextResponse.json({ tasks: visibleTasks })
}
