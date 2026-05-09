import { NextResponse } from 'next/server'

import { getCurrentUserId } from '@/lib/auth/get-current-user'
import {
  createGeneration,
  createOrUpdateOutline,
  getPresentation,
  updatePresentationStatus
} from '@/lib/db/actions/presentations'

const textEncoder = new TextEncoder()

/**
 * POST /api/presentations/:id/generate-outline
 * Start outline generation with SSE streaming
 *
 * Note: MiniMax integration requires @ai-sdk/openai-compatible to be installed.
 * This route currently returns a configuration error until the dependency is added.
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
      model: 'MiniMax-Text-01',
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

          // Check if MiniMax is configured
          const apiKey = process.env.MINIMAX_API_KEY
          if (!apiKey) {
            sendEvent('error', { error: 'MINIMAX_API_KEY not configured' })
            await updatePresentationStatus(id, 'error')
            controller.close()
            return
          }

          // Generate outline using MiniMax API directly
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

          const response = await fetch('https://api.minimax.chat/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model: 'abab6.5s-chat',
              messages: [
                { role: 'system', content: 'You are an expert presentation outline generator. Return only valid JSON.' },
                { role: 'user', content: outlinePrompt }
              ],
              stream: true,
              temperature: 0.7,
              max_tokens: 2000
            })
          })

          if (!response.ok) {
            throw new Error(`MiniMax API error: ${response.status}`)
          }

          if (!response.body) {
            throw new Error('No response body')
          }

          const reader = response.body.getReader()
          const decoder = new TextDecoder()

          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            const chunk = decoder.decode(value)
            const lines = chunk.split('\n')

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6)
                if (data === '[DONE]') continue

                try {
                  const parsed = JSON.parse(data)
                  const content = parsed.choices?.[0]?.delta?.content
                  if (content) {
                    fullOutline += content
                    sendEvent('outline_delta', { delta: content })
                  }
                } catch {
                  // Skip invalid JSON lines
                }
              }
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
          sendEvent('error', { error: error instanceof Error ? error.message : 'Failed to generate outline' })
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
