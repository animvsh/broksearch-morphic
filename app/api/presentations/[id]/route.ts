import { NextRequest, NextResponse } from 'next/server'

import { and, asc, eq } from 'drizzle-orm'

import { requireFeatureAccessForApi } from '@/lib/auth/app-access'
import { db } from '@/lib/db'
import { presentations, presentationSlides } from '@/lib/db/schema-brok'
import { withOptionalRLS } from '@/lib/db/with-rls'
import { parsePresentationMarkdown } from '@/lib/presentations/deck'
import { inferLayoutType } from '@/lib/presentations/layout'

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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!UUID_PATTERN.test(id ?? '')) {
    return badRequest('Invalid presentation id.')
  }

  const access = await requireFeatureAccessForApi('presentations')
  if (!access.ok) return access.response
  const userId = access.user.id
  if (!UUID_PATTERN.test(userId)) {
    return badRequest(
      'Anonymous user_id is not a UUID; presentations require a real account.'
    )
  }
  if (!UUID_PATTERN.test(userId)) {
    return badRequest(
      'Anonymous user_id is not a UUID; presentations require a real account.'
    )
  }

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
    return NextResponse.json({
      presentation: result.deck,
      slides: result.slides
    })
  } catch (error) {
    return serviceUnavailable(
      error instanceof Error ? error.message : 'Failed to load presentation'
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!UUID_PATTERN.test(id ?? '')) {
    return badRequest('Invalid presentation id.')
  }

  const access = await requireFeatureAccessForApi('presentations')
  if (!access.ok) return access.response
  const userId = access.user.id
  if (!UUID_PATTERN.test(userId)) {
    return badRequest(
      'Anonymous user_id is not a UUID; presentations require a real account.'
    )
  }
  if (!UUID_PATTERN.test(userId)) {
    return badRequest(
      'Anonymous user_id is not a UUID; presentations require a real account.'
    )
  }

  let body: {
    title?: string
    description?: string
    sourceMarkdown?: string
  } = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const updates: Partial<{
    title: string
    description: string | null
    sourceMarkdown: string
  }> = {}

  if (typeof body.title === 'string') {
    const title = body.title.trim().slice(0, 200)
    if (!title) return badRequest('Title cannot be empty.')
    updates.title = title
  }
  if (typeof body.description === 'string') {
    updates.description = body.description.trim().slice(0, 1000) || null
  }
  if (typeof body.sourceMarkdown === 'string') {
    updates.sourceMarkdown = body.sourceMarkdown.slice(0, 200_000)
  }

  if (Object.keys(updates).length === 0) {
    return badRequest('No fields to update.')
  }

  try {
    const result = await withOptionalRLS(userId, async tx => {
      const slides =
        typeof updates.sourceMarkdown === 'string'
          ? parsePresentationMarkdown(updates.sourceMarkdown)
          : null

      const [row] = await tx
        .update(presentations)
        .set({
          ...updates,
          ...(slides
            ? {
                slideCount: slides.length,
                updatedAt: new Date()
              }
            : { updatedAt: new Date() })
        })
        .where(and(eq(presentations.id, id), eq(presentations.userId, userId)))
        .returning({ id: presentations.id })

      if (!row) return null

      if (slides) {
        await tx
          .delete(presentationSlides)
          .where(eq(presentationSlides.presentationId, id))

        if (slides.length > 0) {
          await tx.insert(presentationSlides).values(
            slides.map((slide, index) => ({
              presentationId: id,
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
        }
      }

      return row
    })

    if (!result) return notFound()
    return NextResponse.json({ ok: true, id: result.id })
  } catch (error) {
    return serviceUnavailable(
      error instanceof Error ? error.message : 'Failed to update presentation'
    )
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!UUID_PATTERN.test(id ?? '')) {
    return badRequest('Invalid presentation id.')
  }

  const access = await requireFeatureAccessForApi('presentations')
  if (!access.ok) return access.response
  const userId = access.user.id
  if (!UUID_PATTERN.test(userId)) {
    return badRequest(
      'Anonymous user_id is not a UUID; presentations require a real account.'
    )
  }
  if (!UUID_PATTERN.test(userId)) {
    return badRequest(
      'Anonymous user_id is not a UUID; presentations require a real account.'
    )
  }

  try {
    const result = await withOptionalRLS(userId, async tx => {
      const [row] = await tx
        .delete(presentations)
        .where(and(eq(presentations.id, id), eq(presentations.userId, userId)))
        .returning({ id: presentations.id })
      return row ?? null
    })

    if (!result) return notFound()
    return NextResponse.json({ ok: true, id: result.id })
  } catch (error) {
    return serviceUnavailable(
      error instanceof Error ? error.message : 'Failed to delete presentation'
    )
  }
}
