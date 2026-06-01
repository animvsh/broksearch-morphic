import { NextRequest, NextResponse } from 'next/server'

import { and, asc, eq } from 'drizzle-orm'

import { getCurrentUserId } from '@/lib/auth/get-current-user'
import { presentations, presentationSlides } from '@/lib/db/schema-brok'
import { withOptionalRLS } from '@/lib/db/with-rls'
import { samplePresentationSource } from '@/lib/presentations/deck'
import {
  type ExportSlide,
  slidesToMarkdown,
  slidesToRevealHtml
} from '@/lib/presentations/export'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

function toExportSlides(
  slides: { title: string; contentJson: unknown; speakerNotes: string | null }[]
): ExportSlide[] {
  return slides.map(s => ({
    title: s.title,
    contentJson: (s.contentJson ?? {}) as ExportSlide['contentJson'],
    speakerNotes: s.speakerNotes
  }))
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!UUID_PATTERN.test(id ?? '')) {
    return badRequest('Invalid presentation id.')
  }

  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json(
      { error: { type: 'auth', message: 'Authentication required' } },
      { status: 401 }
    )
  }

  const format = request.nextUrl.searchParams.get('format') ?? 'markdown'

  try {
    const result = await withOptionalRLS(userId, async tx => {
      const [deck] = await tx
        .select()
        .from(presentations)
        .where(and(eq(presentations.id, id), eq(presentations.userId, userId)))
        .limit(1)
      if (!deck) return null

      const slides = await tx
        .select()
        .from(presentationSlides)
        .where(eq(presentationSlides.presentationId, id))
        .orderBy(asc(presentationSlides.slideIndex))

      return { deck, slides }
    })

    if (!result) return notFound()

    const { deck, slides } = result
    const safeTitle = (deck.title || 'presentation')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

    if (format === 'json') {
      return NextResponse.json({
        presentation: deck,
        slides
      })
    }

    if (format === 'html') {
      const html = slidesToRevealHtml(deck.title, toExportSlides(slides))
      return new NextResponse(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': `attachment; filename="${safeTitle}.html"`
        }
      })
    }

    if (format === 'markdown' || format === 'md') {
      const markdown =
        slides.length > 0
          ? slidesToMarkdown(deck.title, toExportSlides(slides))
          : (deck.sourceMarkdown ?? samplePresentationSource)
      return new NextResponse(markdown, {
        status: 200,
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="${safeTitle}.md"`
        }
      })
    }

    return badRequest(
      `Unsupported format '${format}'. Use markdown, html, or json.`
    )
  } catch (error) {
    return serviceUnavailable(
      error instanceof Error ? error.message : 'Failed to export presentation'
    )
  }
}
