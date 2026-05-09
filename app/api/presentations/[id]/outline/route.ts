import { NextResponse } from 'next/server'

import { getCurrentUserId } from '@/lib/auth/get-current-user'
import { createOrUpdateOutline, getOutline } from '@/lib/db/actions/presentations'

/**
 * PATCH /api/presentations/:id/outline
 * Update the presentation outline
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
    const { outline_json } = body

    if (!outline_json || !Array.isArray(outline_json)) {
      return NextResponse.json(
        { error: 'outline_json is required and must be an array' },
        { status: 400 }
      )
    }

    // Validate outline structure
    for (const slide of outline_json) {
      if (!slide.title || typeof slide.title !== 'string') {
        return NextResponse.json(
          { error: 'Each slide must have a title string' },
          { status: 400 }
        )
      }
      if (!Array.isArray(slide.bullets)) {
        return NextResponse.json(
          { error: 'Each slide must have a bullets array' },
          { status: 400 }
        )
      }
    }

    const outline = await createOrUpdateOutline({
      presentationId: id,
      outlineJson: outline_json,
      status: 'ready'
    })

    return NextResponse.json({ outline })
  } catch (error) {
    console.error('Error updating outline:', error)
    return NextResponse.json(
      { error: 'Failed to update outline' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/presentations/:id/outline
 * Get the presentation outline
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const outline = await getOutline(id)

    if (!outline) {
      return NextResponse.json(
        { error: 'Outline not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ outline })
  } catch (error) {
    console.error('Error getting outline:', error)
    return NextResponse.json(
      { error: 'Failed to get outline' },
      { status: 500 }
    )
  }
}
