import { NextResponse } from 'next/server'

import { getCurrentUserId } from '@/lib/auth/get-current-user'
import {
  getOutline,
  getPresentation,
  getSlides
} from '@/lib/db/actions/presentations'

const textEncoder = new TextEncoder()

/**
 * GET /api/presentations/:id/stream
 * SSE stream for generation events
 *
 * This endpoint replays the current generation state as SSE so clients can
 * reconnect without falling back to polling. The generation routes still emit
 * live token/slide events while work is running.
 *
 * Events returned:
 * - outline_started, outline_delta, outline_complete
 * - slide_started, slide_complete, deck_complete
 * - error
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const userId = await getCurrentUserId()

    // Optional: verify user has access to this presentation
    let presentation = null
    if (userId) {
      presentation = await getPresentation(id, userId)
      if (!presentation) {
        return NextResponse.json(
          { error: 'Presentation not found' },
          { status: 404 }
        )
      }
    } else {
      presentation = await getPresentation(id)
    }

    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (type: string, data: Record<string, unknown>) => {
          controller.enqueue(
            textEncoder.encode(`data: ${JSON.stringify({ type, data })}\n\n`)
          )
        }

        try {
          sendEvent('stream_connected', {
            presentationId: id,
            status: presentation?.status ?? 'unknown'
          })

          const outline = await getOutline(id)
          if (outline) {
            sendEvent('outline_complete', {
              slideCount: outline.outlineJson.length,
              outline: outline.outlineJson
            })
          }

          const slides = await getSlides(id)
          for (const slide of slides) {
            sendEvent('slide_complete', {
              index: slide.slideIndex,
              title: slide.title,
              slideId: slide.id
            })
          }

          sendEvent('stream_complete', {
            presentationId: id,
            slideCount: slides.length
          })
        } catch (error) {
          sendEvent('error', {
            error:
              error instanceof Error
                ? error.message
                : 'Could not replay presentation stream.'
          })
        } finally {
          controller.close()
        }
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive'
      }
    })
  } catch (error) {
    console.error('Error in stream endpoint:', error)
    return NextResponse.json(
      { error: 'Failed to get stream status' },
      { status: 500 }
    )
  }
}
