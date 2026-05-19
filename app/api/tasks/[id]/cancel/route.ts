import { NextResponse } from 'next/server'

import { requireFeatureAccessForApi } from '@/lib/auth/app-access'
import {
  appendBackgroundTaskEvent,
  getBackgroundTask,
  updateBackgroundTask
} from '@/lib/tasks/background-tasks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled'])

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireFeatureAccessForApi('search')
  if (!access.ok) return access.response

  const { id } = await params
  const existing = await getBackgroundTask({ userId: access.user.id, id })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (TERMINAL_STATUSES.has(existing.status)) {
    return NextResponse.json({ task: existing })
  }

  await appendBackgroundTaskEvent({
    id,
    userId: access.user.id,
    message: 'Task cancelled by user',
    progress:
      typeof existing.metadata?.progress === 'number'
        ? existing.metadata.progress
        : undefined
  })

  const task = await updateBackgroundTask({
    id,
    userId: access.user.id,
    status: 'cancelled',
    error: 'Cancelled by user'
  })

  return NextResponse.json({ task })
}
