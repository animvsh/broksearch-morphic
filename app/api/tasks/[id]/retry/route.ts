import { NextResponse } from 'next/server'

import { requireAnyFeatureAccessForApi } from '@/lib/auth/app-access'
import { buildBrokCodeTaskRetryRequest } from '@/lib/brokcode/task-retry'
import {
  appendBackgroundTaskEvent,
  getBackgroundTask
} from '@/lib/tasks/background-tasks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireAnyFeatureAccessForApi(['brokcode'])
  if (!access.ok) return access.response

  const { id } = await params
  const existing = await getBackgroundTask({ userId: access.user.id, id })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const result = buildBrokCodeTaskRetryRequest(existing)
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error
      },
      { status: result.status }
    )
  }

  await appendBackgroundTaskEvent({
    id,
    userId: access.user.id,
    message: 'Retry requested from BrokCode task history',
    progress:
      typeof existing.metadata?.progress === 'number'
        ? existing.metadata.progress
        : undefined,
    metadata: {
      retryRequestedAt: new Date().toISOString()
    }
  })

  return NextResponse.json({
    task: existing,
    retry: result.retry
  })
}
