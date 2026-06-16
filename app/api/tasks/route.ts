import { NextResponse } from 'next/server'

import { requireAnyFeatureAccessForApi } from '@/lib/auth/app-access'
import { reconcileStaleBrokCodeTask } from '@/lib/brokcode/durable-job'
import { listBackgroundTasks } from '@/lib/tasks/background-tasks'
import { canAccessTaskKind } from '@/lib/tasks/task-feature-access'

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
  const visibleTasks = reconciledTasks.filter(task =>
    canAccessTaskKind(access.access, task.kind)
  )

  return NextResponse.json({ tasks: visibleTasks })
}
