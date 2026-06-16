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

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled'])

function sse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireAnyFeatureAccessForApi(['search', 'brokcode'])
  if (!access.ok) return access.response
  const appAccess = access.access

  const { id } = await params
  const userId = access.user.id
  const initialTask = await getBackgroundTask({ userId, id })
  if (!initialTask) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (!canAccessTaskKind(appAccess, initialTask.kind)) {
    return NextResponse.json(getTaskFeatureDeniedBody(initialTask.kind), {
      status: 403
    })
  }

  const encoder = new TextEncoder()
  let closed = false

  return new Response(
    new ReadableStream({
      async start(controller) {
        async function sendLatest() {
          if (closed) return

          const task = await getBackgroundTask({ userId, id })
          if (!task) {
            controller.enqueue(
              encoder.encode(
                sse('task.error', { id, error: 'Task is no longer available' })
              )
            )
            controller.close()
            closed = true
            return
          }

          const reconciledTask =
            task.kind === 'brokcode'
              ? await reconcileStaleBrokCodeTask({ task })
              : task

          if (!canAccessTaskKind(appAccess, reconciledTask.kind)) {
            controller.enqueue(
              encoder.encode(
                sse('task.error', {
                  id,
                  error: 'Feature access denied'
                })
              )
            )
            controller.close()
            closed = true
            return
          }

          controller.enqueue(
            encoder.encode(sse('task.update', { task: reconciledTask }))
          )

          if (TERMINAL_STATUSES.has(reconciledTask.status)) {
            controller.enqueue(encoder.encode(sse('done', { id })))
            controller.close()
            closed = true
          }
        }

        await sendLatest()

        while (!closed) {
          await new Promise(resolve => setTimeout(resolve, 2000))
          await sendLatest()
        }
      },
      cancel() {
        closed = true
      }
    }),
    {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive'
      }
    }
  )
}
