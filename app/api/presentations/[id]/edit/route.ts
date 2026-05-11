import { NextResponse } from 'next/server'

import { getCurrentUserId } from '@/lib/auth/get-current-user'
import {
  createGeneration,
  getPresentationWithSlides,
  updateGenerationStatus,
  updatePresentationStatus,
  updateSlides
} from '@/lib/db/actions/presentations'
import {
  extractJsonObject,
  generateBrokPresentationText
} from '@/lib/presentations/brok-generation'

/**
 * POST /api/presentations/:id/edit
 * Chat-based edit using Brok intelligence.
 *
 * Uses Brok's provider router.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: presentationId } = await params
  let userId: string | null = null
  let generationId: string | null = null

  try {
    const currentUserId = await getCurrentUserId()
    userId = currentUserId ?? null

    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const presentation = await getPresentationWithSlides(presentationId, userId)
    if (!presentation) {
      return NextResponse.json(
        { error: 'Presentation not found' },
        { status: 404 }
      )
    }

    const body = await req.json()
    const { message } = body

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'message is required' },
        { status: 400 }
      )
    }

    // Update presentation status
    await updatePresentationStatus(presentationId, 'generating')

    // Create generation record
    const generation = await createGeneration({
      presentationId,
      userId,
      prompt: message,
      generationType: 'edit',
      model: 'brok-lite',
      webSearchEnabled: false
    })
    generationId = generation.id

    // Build context about current slides
    const slidesContext = presentation.slides
      .map(
        (slide, idx) =>
          `Slide ${idx + 1}: ${slide.title}\nContent: ${JSON.stringify(slide.contentJson)}`
      )
      .join('\n\n')

    // Generate edit through Brok.
    const editPrompt = `You are editing a presentation. The user wants to make changes.

Current presentation: ${presentation.title}
Number of slides: ${presentation.slides.length}

Current slides:
${slidesContext}

User's edit request: "${message}"

Analyze the user's request and determine which slides need to be modified.
Return a JSON object with the changes:
{
  "updated_slides": [
    {
      "id": "slide-uuid",
      "title": "New Title (optional)",
      "contentJson": { "bullets": ["new", "content"] },
      "speakerNotes": "New notes (optional)"
    }
  ],
  "message": "Explanation of changes made"
}

If the user wants to add a slide, include it with a new id.
If the user wants to delete a slide, include it with null values.
Only return valid JSON.`

    const editResult = await generateBrokPresentationText({
      model: 'brok-lite',
      maxTokens: 2000,
      temperature: 0.65,
      messages: [
        {
          role: 'system',
          content:
            'You are an expert Gamma-style presentation editor. Return only valid JSON describing the changes.'
        },
        { role: 'user', content: editPrompt }
      ]
    })

    // Parse the edit result
    let parsedResult: {
      updated_slides: Array<{
        id: string
        title?: string
        contentJson?: Record<string, any>
        speakerNotes?: string
      }>
      message: string
    } | null = null

    parsedResult = extractJsonObject<{
      updated_slides: Array<{
        id: string
        title?: string
        contentJson?: Record<string, any>
        speakerNotes?: string
      }>
      message: string
    }>(editResult)

    if (!parsedResult) {
      await updatePresentationStatus(presentationId, 'ready')
      return NextResponse.json({
        updated_slides: [],
        message: 'Could not understand the edit request. Please try again.'
      })
    }

    // Apply updates to slides
    const updates = parsedResult.updated_slides
      .filter(s => s.id !== null)
      .map(s => ({
        id: s.id,
        title: s.title,
        contentJson: s.contentJson,
        speakerNotes: s.speakerNotes
      }))

    let updatedSlides: any[] = []
    if (updates.length > 0) {
      updatedSlides = await updateSlides(presentationId, updates)
    }

    // Update presentation status
    await updatePresentationStatus(presentationId, 'ready')
    await updateGenerationStatus(generation.id, 'completed')

    return NextResponse.json({
      updated_slides: updatedSlides,
      message:
        parsedResult.message || `Updated ${updatedSlides.length} slide(s).`
    })
  } catch (error) {
    console.error('Error in edit:', error)
    await updatePresentationStatus(presentationId, 'error')
    if (generationId) {
      await updateGenerationStatus(generationId, 'failed')
    }
    return NextResponse.json(
      { error: 'Failed to edit presentation' },
      { status: 500 }
    )
  }
}
