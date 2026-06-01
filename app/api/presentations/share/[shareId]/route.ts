import { NextRequest, NextResponse } from 'next/server'

import { and, asc, eq } from 'drizzle-orm'

import { presentations, presentationSlides } from '@/lib/db/schema-brok'
import { withOptionalRLS } from '@/lib/db/with-rls'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SHARE_ID_PATTERN = /^[0-9A-Za-z]{6,64}$/

function badRequest(message: string) {
  return NextResponse.json(
    {
      error: { type: 'invalid_request_error', code: 'invalid_request', message }
    },
    { status: 400 }
  )
}

function notFound() {
  return NextResponse.json(
    {
      error: {
        type: 'not_found',
        code: 'presentation_not_found',
        message: 'Presentation not found.'
      }
    },
    { status: 404 }
  )
}

function serviceUnavailable(message: string) {
  return NextResponse.json(
    { error: { type: 'service_unavailable', code: 'unavailable', message } },
    { status: 503 }
  )
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ shareId: string }> }
) {
  const { shareId } = await params
  if (!SHARE_ID_PATTERN.test(shareId ?? '')) {
    return badRequest('Invalid share id.')
  }

  try {
    const result = await withOptionalRLS(null, async tx => {
      const [deck] = await tx
        .select()
        .from(presentations)
        .where(
          and(
            eq(presentations.shareId, shareId),
            eq(presentations.isPublic, true)
          )
        )
        .limit(1)

      if (!deck) return null

      const slides = await tx
        .select()
        .from(presentationSlides)
        .where(eq(presentationSlides.presentationId, deck.id))
        .orderBy(asc(presentationSlides.slideIndex))

      return { deck, slides }
    })

    if (!result) return notFound()

    return NextResponse.json({
      presentation: result.deck,
      slides: result.slides
    })
  } catch (error) {
    return serviceUnavailable(
      error instanceof Error
        ? error.message
        : 'Failed to load shared presentation'
    )
  }
}
