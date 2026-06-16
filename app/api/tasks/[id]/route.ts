import { NextResponse } from 'next/server'

import { requireAnyFeatureAccessForApi } from '@/lib/auth/app-access'
import { reconcileStaleBrokCodeTask } from '@/lib/brokcode/durable-job'
import { getBackgroundTask } from '@/lib/tasks/background-tasks'
import {
  canAccessTaskKind,
  getTaskFeatureDeniedBody
} from '@/lib/tasks/task-feature-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireAnyFeatureAccessForApi(['search', 'brokcode'])
  if (!access.ok) return access.response

  const { id } = await params
  const task = await getBackgroundTask({ userId: access.user.id, id })
  if (!task) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const reconciledTask =
    task.kind === 'brokcode' ? await reconcileStaleBrokCodeTask({ task }) : task

  if (!canAccessTaskKind(access.access, reconciledTask.kind)) {
    return NextResponse.json(getTaskFeatureDeniedBody(reconciledTask.kind), {
      status: 403
    })
  }

  return NextResponse.json({ task: reconciledTask })
}
