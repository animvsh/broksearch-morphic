import { NextResponse } from 'next/server'

import { newBrokBuildProjectId, startBrokBuild } from '@/lib/actions/build'
import type { BrokStreamEvent } from '@/lib/build/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no'
}

function encode(event: BrokStreamEvent) {
  return `event: brok\ndata: ${JSON.stringify(event)}\n\n`
}

export async function POST(request: Request) {
  let body: { prompt?: unknown; projectId?: unknown } = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body.' },
      { status: 400 }
    )
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  if (!prompt) {
    return NextResponse.json(
      { error: 'A non-empty prompt is required.' },
      { status: 400 }
    )
  }
  if (prompt.length > 4000) {
    return NextResponse.json(
      { error: 'Prompt is too long (max 4000 chars).' },
      { status: 400 }
    )
  }

  const projectId =
    typeof body.projectId === 'string' && body.projectId.length > 0
      ? body.projectId
      : await newBrokBuildProjectId()

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        await startBrokBuild({
          prompt,
          projectId,
          emit: event => {
            controller.enqueue(encoder.encode(encode(event)))
          }
        })
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Build stream failed.'
        controller.enqueue(
          encoder.encode(
            encode({ kind: 'error', message } satisfies BrokStreamEvent)
          )
        )
      } finally {
        controller.close()
      }
    }
  })

  return new Response(stream, { headers: SSE_HEADERS })
}
