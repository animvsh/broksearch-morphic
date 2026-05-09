import { NextResponse } from 'next/server'

import { getCurrentUserId } from '@/lib/auth/get-current-user'
import { setPresentationShare } from '@/lib/db/actions/presentations'

/**
 * POST /api/presentations/:id/share
 * Create or update share link
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

    const body = await req.json()
    const { is_public, password } = body

    if (typeof is_public !== 'boolean') {
      return NextResponse.json(
        { error: 'is_public is required and must be a boolean' },
        { status: 400 }
      )
    }

    const result = await setPresentationShare(id, userId, is_public, password)

    if (!result) {
      return NextResponse.json(
        { error: 'Presentation not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      share_id: result.shareId,
      share_url: result.shareUrl,
      is_public
    })
  } catch (error) {
    console.error('Error sharing presentation:', error)
    return NextResponse.json(
      { error: 'Failed to share presentation' },
      { status: 500 }
    )
  }
}
