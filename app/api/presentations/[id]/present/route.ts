import { NextResponse } from 'next/server'

import { getCurrentUserId } from '@/lib/auth/get-current-user'
import {
  getPresentation,
  getPresentationWithSlides,
  getSlides
} from '@/lib/db/actions/presentations'

/**
 * GET /api/presentations/:id/present
 * Get presentation data for public share view
 * No auth required if presentation is public
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const userId = await getCurrentUserId()

    // First try to get with user ownership
    let presentation = await getPresentationWithSlides(id, userId || undefined)

    // If not found and no user, try to find public presentation
    if (!presentation) {
      presentation = await getPresentationWithSlides(id, undefined)

      // Check if presentation is public
      if (presentation && !presentation.isPublic) {
        // Presentation is private and user is not the owner
        return NextResponse.json(
          { error: 'Presentation not found or access denied' },
          { status: 404 }
        )
      }
    }

    if (!presentation) {
      return NextResponse.json(
        { error: 'Presentation not found' },
        { status: 404 }
      )
    }

    // For public presentations without owner access, return limited data
    const isOwner = userId && presentation.userId === userId

    if (!isOwner && !presentation.isPublic) {
      return NextResponse.json(
        { error: 'Presentation not found or access denied' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      id: presentation.id,
      title: presentation.title,
      description: presentation.description,
      themeId: presentation.themeId,
      language: presentation.language,
      style: presentation.style,
      slideCount: presentation.slideCount,
      slides: presentation.slides || [],
      is_public: presentation.isPublic,
      created_at: presentation.createdAt,
      updated_at: presentation.updatedAt
    })
  } catch (error) {
    console.error('Error getting presentation for present:', error)
    return NextResponse.json(
      { error: 'Failed to get presentation' },
      { status: 500 }
    )
  }
}
