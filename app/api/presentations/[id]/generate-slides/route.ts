import { streamText } from 'ai'
import { NextResponse } from 'next/server'

import { getCurrentUserId } from '@/lib/auth/get-current-user'
import {
  createGeneration,
  createSlides,
  getOutline,
  getPresentation,
  updatePresentationStatus
} from '@/lib/db/actions/presentations'
import { minimax, MINIMAX_MODEL } from '@/lib/ai/minimax'
import { themes } from '@/lib/presentations/themes'

const textEncoder = new TextEncoder()

interface SlideContent {
  title: string
  layoutType: string
  contentJson: Record<string, any>
  speakerNotes?: string
}

/**
 * POST /api/presentations/:id/generate-slides
 * Start slide generation with SSE streaming
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

    const outline = await getOutline(id)
    if (!outline) {
      return NextResponse.json(
        { error: 'Outline not found. Generate outline first.' },
        { status: 400 }
      )
    }

    const body = await req.json()
    const { theme_id } = body

    // Get theme
    const theme = themes.find(t => t.id === theme_id) || themes[0]

    // Update presentation status
    await updatePresentationStatus(id, 'slides_generating')

    // Create generation record
    await createGeneration({
      presentationId: id,
      userId,
      prompt: `Generate slides for presentation: ${presentation.title}`,
      generationType: 'slides',
      model: MINIMAX_MODEL,
      webSearchEnabled: false
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
          const slides: SlideContent[] = []
          const outlineSlides = outline.outlineJson

          for (let i = 0; i < outlineSlides.length; i++) {
            const outlineSlide = outlineSlides[i]

            sendEvent('slide_started', {
              index: i,
              title: outlineSlide.title
            })

            // Generate slide content
            const slidePrompt = `Generate slide content for:
Title: "${outlineSlide.title}"
Bullets: ${outlineSlide.bullets.join(', ')}

Theme: ${theme.name}
Colors: background=${theme.colors.background}, text=${theme.colors.text}, accent=${theme.colors.accent}
Fonts: heading=${theme.fonts.heading}, body=${theme.fonts.body}

Generate a slide with:
- layoutType: "bullet" (use "title" for first slide)
- contentJson: { bullets: string[], emphasis?: string[] }
- speakerNotes: string with presentation tips

Return as JSON:
{
  "title": "Slide Title",
  "layoutType": "bullet",
  "contentJson": { "bullets": ["point 1", "point 2"], "emphasis": ["key point"] },
  "speakerNotes": "Tips for presenting this slide"
}

Only return valid JSON.`

            let slideContent = ''

            const result = await streamText({
              model: minimax.languageModel(MINIMAX_MODEL),
              prompt: slidePrompt,
              system: 'You are an expert slide content generator. Return only valid JSON.',
              temperature: 0.7,
              maxTokens: 500
            })

            for await (const delta of result.fullStream) {
              if (delta.type === 'text-delta' && delta.text) {
                slideContent += delta.text
              }
            }

            // Parse slide content
            let slideData: SlideContent | null = null
            try {
              const jsonMatch = slideContent.match(/\{[\s\S]*\}/)
              if (jsonMatch) {
                slideData = JSON.parse(jsonMatch[0])
              }
            } catch (parseError) {
              console.error('Error parsing slide JSON:', parseError)
            }

            if (!slideData) {
              // Fallback to basic slide
              slideData = {
                title: outlineSlide.title,
                layoutType: i === 0 ? 'title' : 'bullet',
                contentJson: { bullets: outlineSlide.bullets },
                speakerNotes: `Present: ${outlineSlide.title}`
              }
            }

            slides.push({
              slideIndex: i,
              title: slideData.title || outlineSlide.title,
              layoutType: slideData.layoutType || (i === 0 ? 'title' : 'bullet'),
              contentJson: slideData.contentJson || { bullets: outlineSlide.bullets },
              speakerNotes: slideData.speakerNotes
            })

            sendEvent('slide_complete', {
              index: i,
              title: slides[i].title
            })

            // Small delay between slides to allow client to process
            await new Promise(resolve => setTimeout(resolve, 100))
          }

          // Save all slides to database
          await createSlides({
            presentationId: id,
            slides: slides.map((s, idx) => ({
              slideIndex: idx,
              title: s.title,
              layoutType: s.layoutType,
              contentJson: s.contentJson,
              speakerNotes: s.speakerNotes
            }))
          })

          sendEvent('deck_complete', {
            slideCount: slides.length
          })
        } catch (error) {
          console.error('Error generating slides:', error)
          await updatePresentationStatus(id, 'error')
          sendEvent('error', { error: 'Failed to generate slides' })
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
    console.error('Error in generate-slides:', error)
    return NextResponse.json(
      { error: 'Failed to start slide generation' },
      { status: 500 }
    )
  }
}
