import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { and, asc, eq } from 'drizzle-orm'

import { db } from '@/lib/db'
import { presentations, presentationSlides } from '@/lib/db/schema-brok'
import { parsePresentationMarkdown } from '@/lib/presentations/deck'

import { PublicRevealViewer } from '@/components/presentations/public-reveal-viewer'

type PublicPresentationPageProps = {
  params: Promise<{ shareId: string }>
}

type SlideContent = {
  id?: string
  kicker?: string | null
  body?: string[]
  bullets?: string[]
}

async function loadPublicPresentation(shareId: string) {
  const [deck] = await db
    .select()
    .from(presentations)
    .where(
      and(eq(presentations.shareId, shareId), eq(presentations.isPublic, true))
    )
    .limit(1)

  if (!deck) return null

  const rows = await db
    .select()
    .from(presentationSlides)
    .where(eq(presentationSlides.presentationId, deck.id))
    .orderBy(asc(presentationSlides.slideIndex))

  const slides =
    rows.length > 0
      ? rows.map(row => {
          const content = (row.contentJson ?? {}) as SlideContent
          return {
            id: content.id ?? row.id,
            title: row.title,
            kicker: content.kicker ?? null,
            body: Array.isArray(content.body) ? content.body : [],
            bullets: Array.isArray(content.bullets) ? content.bullets : [],
            notes: row.speakerNotes
          }
        })
      : parsePresentationMarkdown(deck.sourceMarkdown ?? '').map(slide => ({
          id: slide.id,
          title: slide.title,
          kicker: slide.kicker ?? null,
          body: slide.body,
          bullets: slide.bullets,
          notes: slide.notes ?? null
        }))

  return { deck, slides }
}

export async function generateMetadata({
  params
}: PublicPresentationPageProps): Promise<Metadata> {
  const { shareId } = await params
  const result = await loadPublicPresentation(shareId)
  if (!result) return { title: 'Presentation not found' }

  return {
    title: result.deck.title,
    description: result.deck.description ?? 'A shared Brok presentation deck.'
  }
}

export default async function PublicPresentationPage({
  params
}: PublicPresentationPageProps) {
  const { shareId } = await params
  const result = await loadPublicPresentation(shareId)

  if (!result || result.slides.length === 0) {
    notFound()
  }

  return (
    <PublicRevealViewer
      title={result.deck.title}
      description={result.deck.description}
      slides={result.slides}
    />
  )
}
