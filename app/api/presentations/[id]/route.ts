import { NextResponse } from 'next/server'

import { getCurrentUserId } from '@/lib/auth/get-current-user'
import {
  createSlides,
  deletePresentation,
  getOutline,
  getPresentationWithSlides,
  updatePresentation
} from '@/lib/db/actions/presentations'

/**
 * GET /api/presentations/:id
 * Get presentation with slides
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const userId = await getCurrentUserId()

    const presentation = await getPresentationWithSlides(
      id,
      userId || undefined
    )

    if (!presentation) {
      return NextResponse.json(
        { error: 'Presentation not found' },
        { status: 404 }
      )
    }

    const outline = await getOutline(id)

    return NextResponse.json({
      ...presentation,
      outline: outline ? { slides: outline.outlineJson } : undefined
    })
  } catch (error) {
    console.error('Error getting presentation:', error)
    return NextResponse.json(
      { error: 'Failed to get presentation' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/presentations/:id
 * Update presentation title/description/theme/slide_count
 */
export async function PATCH(
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

    const body = await req.json()
    const { title, description, theme, themeId, slide_count, slides } = body

    const updates: {
      title?: string
      description?: string
      themeId?: string
      slideCount?: number
    } = {}

    if (title !== undefined) updates.title = title
    if (description !== undefined) updates.description = description
    if (theme !== undefined) updates.themeId = theme
    if (themeId !== undefined) updates.themeId = themeId
    if (slide_count !== undefined) updates.slideCount = slide_count

    const presentation = await updatePresentation(id, userId, updates)

    if (!presentation) {
      return NextResponse.json(
        { error: 'Presentation not found' },
        { status: 404 }
      )
    }

    if (Array.isArray(slides)) {
      await createSlides({
        presentationId: id,
        slides: slides.map((slide: Record<string, any>, index: number) => ({
          slideIndex: index,
          title: String(slide.title || `Slide ${index + 1}`),
          layoutType: String(slide.layoutType || slide.layout_type || 'text'),
          contentJson: {
            bullets: Array.isArray(slide.bullets) ? slide.bullets : [],
            subtitle: slide.subtitle ?? null,
            background: slide.background ?? null,
            imageUrl: slide.imageUrl ?? null,
            imagePrompt: slide.imagePrompt ?? null,
            chartData: slide.chartData ?? null,
            quoteText: slide.quoteText ?? null,
            quoteAttribution: slide.quoteAttribution ?? null,
            elements: Array.isArray(slide.elements) ? slide.elements : []
          },
          speakerNotes:
            typeof slide.speakerNotes === 'string'
              ? slide.speakerNotes
              : undefined
        }))
      })
    }

    return NextResponse.json(presentation)
  } catch (error) {
    console.error('Error updating presentation:', error)
    return NextResponse.json(
      { error: 'Failed to update presentation' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/presentations/:id
 * Delete presentation and all related records
 */
export async function DELETE(
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

    const result = await deletePresentation(id, userId)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to delete presentation' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting presentation:', error)
    return NextResponse.json(
      { error: 'Failed to delete presentation' },
      { status: 500 }
    )
  }
}
