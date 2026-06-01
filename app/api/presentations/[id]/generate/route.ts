import { NextRequest, NextResponse } from 'next/server'

import { and, asc, eq } from 'drizzle-orm'

import { requireFeatureAccessForApi } from '@/lib/auth/app-access'
import { routeToProvider } from '@/lib/brok/provider-router'
import {
  presentationGenerations,
  presentations,
  presentationSlides
} from '@/lib/db/schema-brok'
import { withOptionalRLS } from '@/lib/db/with-rls'
import {
  deterministicOutline,
  MAX_PROMPT_LENGTH,
  parseGeneratedDeck,
  resolveSlideCount
} from '@/lib/presentations/generate'
import { inferLayoutType } from '@/lib/presentations/layout'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DEFAULT_MODEL = 'brok-search'

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

async function generateWithLlm(
  prompt: string,
  slideCount: number
): Promise<string | null> {
  if (
    !process.env.OPENAI_COMPATIBLE_API_KEY &&
    !process.env.BROK_PROVIDER_API_KEY
  ) {
    return null
  }
  const systemPrompt = [
    'You are a presentation outline writer for the Brok platform.',
    `Write a markdown slide deck of exactly ${slideCount} slides.`,
    'Use `---` on its own line to separate slides.',
    'Each slide must start with a `# Title` heading.',
    'You may add a `kicker: ...` line after the title for a one-line subtitle.',
    'Use `- ...` lines for bullets. Keep prose short (1-3 sentences).',
    'Add `notes: ...` at the end of any slide to capture speaker notes.',
    'Do not include any other commentary or wrapping code fences.'
  ].join(' ')

  try {
    const response = await routeToProvider(DEFAULT_MODEL as never, {
      model: DEFAULT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      temperature: 0.6,
      maxTokens: 1200
    })

    const content = response.choices?.[0]?.message?.content
    if (typeof content !== 'string' || content.trim().length === 0) {
      return null
    }
    return content
  } catch {
    return null
  }
}

export async function POST(
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

  let body: { prompt?: string; slideCount?: number; webSearch?: boolean } = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const prompt = (body.prompt ?? '').trim().slice(0, MAX_PROMPT_LENGTH)
  if (!prompt) {
    return badRequest('prompt is required.')
  }

  const slideCount = resolveSlideCount(body.slideCount, prompt)

  try {
    const deck = await withOptionalRLS(userId, async tx => {
      const [existing] = await tx
        .select()
        .from(presentations)
        .where(and(eq(presentations.id, id), eq(presentations.userId, userId)))
        .limit(1)
      if (!existing) return null

      await tx
        .update(presentations)
        .set({ status: 'generating', updatedAt: new Date() })
        .where(eq(presentations.id, id))

      return existing
    })

    if (!deck) return notFound()

    const startedAt = new Date()
    const [generationRow] = await withOptionalRLS(userId, tx =>
      tx
        .insert(presentationGenerations)
        .values({
          presentationId: id,
          userId,
          prompt,
          generationType: 'outline_to_slides',
          model: DEFAULT_MODEL,
          webSearchEnabled: body.webSearch === true,
          status: 'started'
        })
        .returning({ id: presentationGenerations.id })
    )

    let source = await generateWithLlm(prompt, slideCount)
    let slides = source ? parseGeneratedDeck(source, slideCount) : null
    let generator: 'llm' | 'fallback' = slides ? 'llm' : 'fallback'
    if (!source || !slides) {
      source = deterministicOutline(prompt, slideCount)
      slides = parseGeneratedDeck(source, slideCount)
    }

    if (!slides) {
      await withOptionalRLS(userId, tx =>
        tx
          .update(presentationGenerations)
          .set({ status: 'failed' })
          .where(eq(presentationGenerations.id, generationRow.id))
      )
      await withOptionalRLS(userId, tx =>
        tx
          .update(presentations)
          .set({ status: 'error', updatedAt: new Date() })
          .where(eq(presentations.id, id))
      )
      return serviceUnavailable('Generator returned no parseable slides.')
    }

    await withOptionalRLS(userId, async tx => {
      await tx
        .delete(presentationSlides)
        .where(eq(presentationSlides.presentationId, id))

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

      await tx
        .update(presentationGenerations)
        .set({
          status: 'completed',
          inputTokens: prompt.length,
          outputTokens: source.length,
          costUsd: 0
        })
        .where(eq(presentationGenerations.id, generationRow.id))

      await tx
        .update(presentations)
        .set({
          status: 'ready',
          slideCount: slides.length,
          sourceMarkdown: source,
          updatedAt: new Date()
        })
        .where(eq(presentations.id, id))
    })

    const finalSlides = await withOptionalRLS(userId, tx =>
      tx
        .select()
        .from(presentationSlides)
        .where(eq(presentationSlides.presentationId, id))
        .orderBy(asc(presentationSlides.slideIndex))
    )

    return NextResponse.json({
      ok: true,
      generator,
      slideCount: finalSlides.length,
      generationId: generationRow.id,
      durationMs: Date.now() - startedAt.getTime(),
      slides: finalSlides,
      sourceMarkdown: source
    })
  } catch (error) {
    return serviceUnavailable(
      error instanceof Error ? error.message : 'Failed to generate presentation'
    )
  }
}
