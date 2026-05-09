import { streamText } from 'ai'
import { NextResponse } from 'next/server'

import { getCurrentUserId } from '@/lib/auth/get-current-user'
import {
  createGeneration,
  getPresentationWithSlides,
  updatePresentationStatus,
  updateSlides
} from '@/lib/db/actions/presentations'
import { minimax, MINIMAX_MODEL } from '@/lib/ai/minimax'

/**
 * POST /api/presentations/:id/edit
 * Chat-based edit using MiniMax
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

    const presentation = await getPresentationWithSlides(id, userId)
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
    await updatePresentationStatus(id, 'generating')

    // Create generation record
    await createGeneration({
      presentationId: id,
      userId,
      prompt: message,
      generationType: 'edit',
      model: MINIMAX_MODEL,
      webSearchEnabled: false
    })

    // Build context about current slides
    const slidesContext = presentation.slides
      .map((slide, idx) => `Slide ${idx + 1}: ${slide.title}\nContent: ${JSON.stringify(slide.contentJson)}`)
      .join('\n\n')

    // Generate edit using MiniMax
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

    let editResult = ''

    const result = await streamText({
      model: minimax.languageModel(MINIMAX_MODEL),
      prompt: editPrompt,
      system: 'You are an expert presentation editor. Return only valid JSON describing the changes.',
      temperature: 0.7,
      maxTokens: 2000
    })

    for await (const delta of result.fullStream) {
      if (delta.type === 'text-delta' && delta.text) {
        editResult += delta.text
      }
    }

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

    try {
      const jsonMatch = editResult.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        parsedResult = JSON.parse(jsonMatch[0])
      }
    } catch (parseError) {
      console.error('Error parsing edit result:', parseError)
    }

    if (!parsedResult) {
      await updatePresentationStatus(id, 'ready')
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
      updatedSlides = await updateSlides(id, updates)
    }

    // Update presentation status
    await updatePresentationStatus(id, 'ready')

    return NextResponse.json({
      updated_slides: updatedSlides,
      message: parsedResult.message || `Updated ${updatedSlides.length} slide(s).`
    })
  } catch (error) {
    console.error('Error in edit:', error)
    await updatePresentationStatus(id, 'error')
    return NextResponse.json(
      { error: 'Failed to edit presentation' },
      { status: 500 }
    )
  }
}
