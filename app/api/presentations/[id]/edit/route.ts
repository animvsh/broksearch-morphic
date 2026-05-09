import { NextResponse } from 'next/server'

import { getCurrentUserId } from '@/lib/auth/get-current-user'
import {
  createGeneration,
  getPresentationWithSlides,
  updatePresentationStatus,
  updateSlides
} from '@/lib/db/actions/presentations'

/**
 * POST /api/presentations/:id/edit
 * Chat-based edit using MiniMax
 *
 * Note: MiniMax integration requires @ai-sdk/openai-compatible to be installed.
 * This route currently uses direct API calls until the dependency is added.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: presentationId } = await params
  let userId: string | null = null

  try {
    userId = await getCurrentUserId()

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
    await createGeneration({
      presentationId,
      userId,
      prompt: message,
      generationType: 'edit',
      model: 'abab6.5s-chat',
      webSearchEnabled: false
    })

    // Check if MiniMax is configured
    const apiKey = process.env.MINIMAX_API_KEY
    if (!apiKey) {
      await updatePresentationStatus(presentationId, 'ready')
      return NextResponse.json({
        updated_slides: [],
        message: 'MINIMAX_API_KEY not configured. Cannot process edit request.'
      })
    }

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

    const response = await fetch('https://api.minimax.chat/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'abab6.5s-chat',
        messages: [
          { role: 'system', content: 'You are an expert presentation editor. Return only valid JSON describing the changes.' },
          { role: 'user', content: editPrompt }
        ],
        stream: true,
        temperature: 0.7,
        max_tokens: 2000
      })
    })

    if (!response.ok) {
      throw new Error(`MiniMax API error: ${response.status}`)
    }

    if (response.body) {
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
                editResult += content
              }
            } catch {
              // Skip invalid JSON lines
            }
          }
        }
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

    return NextResponse.json({
      updated_slides: updatedSlides,
      message: parsedResult.message || `Updated ${updatedSlides.length} slide(s).`
    })
  } catch (error) {
    console.error('Error in edit:', error)
    await updatePresentationStatus(presentationId, 'error')
    return NextResponse.json(
      { error: 'Failed to edit presentation' },
      { status: 500 }
    )
  }
}
