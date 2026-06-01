import { NextRequest, NextResponse } from 'next/server'

import { desc, eq } from 'drizzle-orm'

import { requireFeatureAccessForApi } from '@/lib/auth/app-access'
import { canUseDevDbFallback } from '@/lib/db/dev-db-fallback'
import { presentations, presentationSlides } from '@/lib/db/schema-brok'
import { withOptionalRLS } from '@/lib/db/with-rls'
import {
  parsePresentationMarkdown,
  samplePresentationSource
} from '@/lib/presentations/deck'
import { inferLayoutType } from '@/lib/presentations/layout'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function badRequest(message: string, code = 'invalid_request') {
  return NextResponse.json(
    { error: { type: 'invalid_request_error', code, message } },
    { status: 400 }
  )
}

function serviceUnavailable(message: string) {
  return NextResponse.json(
    { error: { type: 'service_unavailable', code: 'unavailable', message } },
    { status: 503 }
  )
}

export async function GET() {
  const access = await requireFeatureAccessForApi('presentations')
  if (!access.ok) return access.response
  const userId = access.user.id
  if (!UUID_PATTERN.test(userId)) {
    return badRequest(
      'Anonymous user_id is not a UUID; presentations require a real account.'
    )
  }

  try {
    const rows = await withOptionalRLS(userId, tx =>
      tx
        .select({
          id: presentations.id,
          title: presentations.title,
          description: presentations.description,
          status: presentations.status,
          slideCount: presentations.slideCount,
          isPublic: presentations.isPublic,
          shareId: presentations.shareId,
          createdAt: presentations.createdAt,
          updatedAt: presentations.updatedAt
        })
        .from(presentations)
        .where(eq(presentations.userId, userId))
        .orderBy(desc(presentations.updatedAt))
        .limit(200)
    )
    return NextResponse.json({ presentations: rows })
  } catch (error) {
    if (canUseDevDbFallback(error)) {
      return NextResponse.json({ presentations: [] })
    }

    if (
      error instanceof Error &&
      error.message.includes('role "placeholder"')
    ) {
      return NextResponse.json({ presentations: [] })
    }
    return serviceUnavailable(
      error instanceof Error ? error.message : 'Failed to list presentations'
    )
  }
}

export async function POST(request: NextRequest) {
  const access = await requireFeatureAccessForApi('presentations')
  if (!access.ok) return access.response
  const userId = access.user.id

  if (!UUID_PATTERN.test(userId)) {
    return badRequest(
      'Anonymous user_id is not a UUID; presentations require a real account. Set ENABLE_AUTH=true with Supabase configured, or ANONYMOUS_USER_ID to a valid UUID.'
    )
  }

  let body: { title?: string; description?: string } = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const title = (body.title ?? 'Untitled Presentation').trim().slice(0, 200)
  if (!title) {
    return badRequest('Title is required.')
  }
  const description = body.description?.trim().slice(0, 1000) ?? null
  const starterSlides = parsePresentationMarkdown(samplePresentationSource)

  try {
    const row = await withOptionalRLS(userId, async tx => {
      const [presentation] = await tx
        .insert(presentations)
        .values({
          userId,
          title,
          description,
          status: 'draft',
          slideCount: starterSlides.length,
          sourceMarkdown: samplePresentationSource
        })
        .returning({
          id: presentations.id,
          title: presentations.title,
          description: presentations.description,
          status: presentations.status,
          slideCount: presentations.slideCount,
          isPublic: presentations.isPublic,
          shareId: presentations.shareId,
          createdAt: presentations.createdAt,
          updatedAt: presentations.updatedAt,
          sourceMarkdown: presentations.sourceMarkdown
        })

      if (!presentation) return null

      await tx.insert(presentationSlides).values(
        starterSlides.map((slide, index) => ({
          presentationId: presentation.id,
          slideIndex: index,
          title: slide.title,
          layoutType: inferLayoutType(slide),
          contentJson: {
            id: slide.id,
            kicker: slide.kicker ?? null,
            body: slide.body,
            bullets: slide.bullets
          },
          speakerNotes: slide.notes ?? null
        }))
      )

      return presentation
    })

    return NextResponse.json({ presentation: row }, { status: 201 })
  } catch (error) {
    return serviceUnavailable(
      error instanceof Error ? error.message : 'Failed to create presentation'
    )
  }
}
