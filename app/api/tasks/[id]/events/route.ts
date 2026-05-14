import { NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getBackgroundTask } from '@/lib/tasks/background-tasks'

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
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const initialTask = await getBackgroundTask({ userId: user.id, id })
  if (!initialTask) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const encoder = new TextEncoder()
  let closed = false

  return new Response(
    new ReadableStream({
      async start(controller) {
        async function sendLatest() {
          if (closed) return

          const task = await getBackgroundTask({ userId: user!.id, id })
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

          controller.enqueue(encoder.encode(sse('task.update', { task })))

          if (TERMINAL_STATUSES.has(task.status)) {
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
