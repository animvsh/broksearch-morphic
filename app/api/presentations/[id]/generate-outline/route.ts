import { NextResponse } from 'next/server'

import { getCurrentUserId } from '@/lib/auth/get-current-user'
import {
  createGeneration,
  createOrUpdateOutline,
  getPresentation,
  updateGenerationStatus,
  updatePresentationStatus
} from '@/lib/db/actions/presentations'
import {
  extractJsonArray,
  generateBrokPresentationText
} from '@/lib/presentations/brok-generation'

const textEncoder = new TextEncoder()

/**
 * POST /api/presentations/:id/generate-outline
 * Start outline generation with SSE streaming
 *
 * Uses Brok's provider router and streams outline progress.
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

    const body = await req.json().catch(() => ({}))
    const { topic, style, language, web_search } = body

    const actualTopic = topic || presentation.title
    const actualStyle = style || presentation.style || 'professional'
    const actualLanguage = language || presentation.language || 'en'

    // Update presentation status
    await updatePresentationStatus(id, 'outline_generating')

    const slideTarget = getTargetSlideCount(
      actualTopic,
      presentation.slideCount
    )

    // Create generation record
    const generation = await createGeneration({
      presentationId: id,
      userId,
      prompt: actualTopic,
      generationType: 'outline',
      model: 'brok-lite',
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

          const outlinePrompt = `Create a presentation outline for the topic: "${actualTopic}"

Generate exactly ${slideTarget} slides.
For each slide, provide:
- title: The slide title
- layout_type: one of "title", "bullet", "two_column", "quote", "chart"
- bullets: 3-5 bullet points covering the key content

Style: ${actualStyle}
Language: ${actualLanguage}
${web_search ? 'Use web search to find current information.' : ''}

Return the outline as a JSON array in this format:
[
  { "title": "Slide Title", "layout_type": "bullet", "bullets": ["point 1", "point 2", ...] },
  ...
]

Only return the JSON array, no other text.`

          const fullOutline = await runWithGenerationTimeout(
            () =>
              generateBrokPresentationText({
                model: 'brok-lite',
                maxTokens: 2200,
                temperature: 0.65,
                messages: [
                  {
                    role: 'system',
                    content:
                      'You are an expert Gamma-style presentation outline generator. Return only valid JSON.'
                  },
                  { role: 'user', content: outlinePrompt }
                ],
                onDelta: delta => sendEvent('outline_delta', { delta })
              }),
            8000,
            ''
          )

          // Parse the outline
          const outlineJson = normalizeOutline(
            extractJsonArray<{
              title?: string
              layout_type?: string
              bullets?: string[]
            }>(fullOutline) ?? buildFallbackOutline(actualTopic, slideTarget),
            slideTarget
          )

          // Save outline to database
          await createOrUpdateOutline({
            presentationId: id,
            outlineJson,
            status: 'ready'
          })

          // Update presentation status
          await updatePresentationStatus(id, 'ready')
          await updateGenerationStatus(generation.id, 'completed')

          sendEvent('outline_complete', { outline: outlineJson })
        } catch (error) {
          console.error('Error generating outline:', error)
          await updatePresentationStatus(id, 'error')
          await updateGenerationStatus(generation.id, 'failed')
          sendEvent('error', {
            error: 'Brok could not generate the outline. Please try again.'
          })
        } finally {
          controller.close()
        }
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
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

function getTargetSlideCount(topic: string, configuredCount: number | null) {
  const explicitCount = topic.match(/\b(\d{1,2})[- ]slide\b/i)?.[1]
  const parsedCount = explicitCount ? Number.parseInt(explicitCount, 10) : 0
  const target = parsedCount || configuredCount || 8
  return Math.min(Math.max(target, 1), 20)
}

function normalizeOutline(
  outline: Array<{ title?: string; layout_type?: string; bullets?: string[] }>,
  slideTarget: number
) {
  const normalized = outline.slice(0, slideTarget).map((slide, index) => ({
    title: slide.title?.trim() || `Slide ${index + 1}`,
    layout_type: normalizeLayoutType(slide.layout_type, index),
    bullets:
      Array.isArray(slide.bullets) && slide.bullets.length > 0
        ? slide.bullets.slice(0, 5).map(String)
        : ['Key message', 'Supporting point', 'Takeaway']
  }))

  while (normalized.length < slideTarget) {
    normalized.push({
      title: `Slide ${normalized.length + 1}`,
      layout_type: normalizeLayoutType(undefined, normalized.length),
      bullets: ['Key message', 'Supporting point', 'Takeaway']
    })
  }

  return normalized
}

function normalizeLayoutType(layoutType: string | undefined, index: number) {
  if (index === 0) return 'title'
  if (
    layoutType &&
    ['title', 'bullet', 'two_column', 'quote', 'chart'].includes(layoutType)
  ) {
    return layoutType
  }
  return 'bullet'
}

function buildFallbackOutline(topic: string, slideTarget: number) {
  const base = [
    {
      title: 'Executive Summary',
      layout_type: 'title',
      bullets: [
        `What ${topic} is about`,
        'Why it matters now',
        'The main outcome for the audience'
      ]
    },
    {
      title: 'Current State',
      layout_type: 'bullet',
      bullets: ['What has been verified', 'What changed', 'What is working']
    },
    {
      title: 'Launch Risks',
      layout_type: 'bullet',
      bullets: ['Open gaps', 'Operational checks', 'Recommended next steps']
    }
  ]

  while (base.length < slideTarget) {
    base.push({
      title: `Key Point ${base.length}`,
      layout_type: 'bullet',
      bullets: ['Context', 'Evidence', 'Recommendation']
    })
  }

  return base
}

function runWithGenerationTimeout<T>(
  task: () => Promise<T>,
  timeoutMs: number,
  fallback: T
) {
  return Promise.race([
    task().catch(error => {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[presentations] AI outline fallback used: ${message}`)
      return fallback
    }),
    new Promise<T>(resolve =>
      setTimeout(() => {
        console.warn('[presentations] AI outline timed out, using fallback')
        resolve(fallback)
      }, timeoutMs)
    )
  ])
}
