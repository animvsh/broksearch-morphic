import { streamText } from 'ai'
import { NextResponse } from 'next/server'

import { getCurrentUserId } from '@/lib/auth/get-current-user'
import { createGeneration, createOrUpdateOutline, getPresentation, updatePresentationStatus } from '@/lib/db/actions/presentations'
import { minimax, MINIMAX_MODEL } from '@/lib/ai/minimax'

const textEncoder = new TextEncoder()

/**
 * POST /api/presentations/:id/generate-outline
 * Start outline generation with SSE streaming
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const userId = await getCurrentUserId()

    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const presentation = await getPresentation(id, userId)
    if (!presentation) {
      return NextResponse.json(
        { error: 'Presentation not found' },
        { status: 404 }
      )
    }

    const body = await req.json()
    const { topic, style, language, web_search } = body

    const actualTopic = topic || presentation.title
    const actualStyle = style || presentation.style || 'professional'
    const actualLanguage = language || presentation.language || 'en'

    // Update presentation status
    await updatePresentationStatus(id, 'outline_generating')

    // Create generation record
    await createGeneration({
      presentationId: id,
      userId,
      prompt: actualTopic,
      generationType: 'outline',
      model: MINIMAX_MODEL,
      webSearchEnabled: web_search
    })

    // Create SSE stream response
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (type: string, data: Record<string, any>) => {
          controller.enqueue(
            textEncoder.encode(`data: ${JSON.stringify({ type, data })}\n\n`)
          )
        }

        try {
          // Send outline_started event
          sendEvent('outline_started', { presentationId: id })

          // Generate outline using MiniMax
          const outlinePrompt = `Create a presentation outline for the topic: "${actualTopic}"

Generate a well-structured presentation outline with 5-10 slides.
For each slide, provide:
- title: The slide title
- bullets: 3-5 bullet points covering the key content

Style: ${actualStyle}
Language: ${actualLanguage}
${web_search ? 'Use web search to find current information.' : ''}

Return the outline as a JSON array in this format:
[
  { "title": "Slide Title", "bullets": ["point 1", "point 2", ...] },
  ...
]

Only return the JSON array, no other text.`

          let fullOutline = ''

          const result = await streamText({
            model: minimax.languageModel(MINIMAX_MODEL),
            prompt: outlinePrompt,
            system: 'You are an expert presentation outline generator. Return only valid JSON.',
            temperature: 0.7,
            maxTokens: 2000
          })

          // Stream the response
          for await (const delta of result.fullStream) {
            if (delta.type === 'text-delta' && delta.text) {
              fullOutline += delta.text
              sendEvent('outline_delta', { delta: delta.text })
            }
          }

          // Parse the outline
          let outlineJson: Array<{ title: string; bullets: string[] }> = []
          try {
            // Try to extract JSON from the response
            const jsonMatch = fullOutline.match(/\[[\s\S]*\]/)
            if (jsonMatch) {
              outlineJson = JSON.parse(jsonMatch[0])
            }
          } catch (parseError) {
            console.error('Error parsing outline JSON:', parseError)
            sendEvent('error', { error: 'Failed to parse outline' })
            controller.close()
            return
          }

          // Save outline to database
          await createOrUpdateOutline({
            presentationId: id,
            outlineJson,
            status: 'ready'
          })

          // Update presentation status
          await updatePresentationStatus(id, 'ready')

          sendEvent('outline_complete', { outline: outlineJson })
        } catch (error) {
          console.error('Error generating outline:', error)
          await updatePresentationStatus(id, 'error')
          sendEvent('error', { error: 'Failed to generate outline' })
        } finally {
          controller.close()
        }
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    })
  } catch (error) {
    console.error('Error in generate-outline:', error)
    return NextResponse.json(
      { error: 'Failed to start outline generation' },
      { status: 500 }
    )
  }
}
