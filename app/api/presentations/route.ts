import { NextResponse } from 'next/server'

import { getCurrentUserId } from '@/lib/auth/get-current-user'
import { createPresentation } from '@/lib/db/actions/presentations'

export const maxDuration = 60

/**
 * POST /api/presentations
 * Create a new presentation
 */
export async function POST(req: Request) {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const body = await req.json()
    const { topic, slide_count, style, language, web_search, theme } = body

    if (!topic || typeof topic !== 'string') {
      return NextResponse.json(
        { error: 'topic is required' },
        { status: 400 }
      )
    }

    const presentation = await createPresentation({
      title: topic,
      userId,
      description: '',
      language: language || 'en',
      style: style,
      slideCount: slide_count || 0,
      themeId: theme
    })

    return NextResponse.json({
      presentation_id: presentation.id,
      status: 'outline_generating'
    })
  } catch (error) {
    console.error('Error creating presentation:', error)
    return NextResponse.json(
      { error: 'Failed to create presentation' },
      { status: 500 }
    )
  }
}
