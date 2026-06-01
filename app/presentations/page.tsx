import type { Metadata } from 'next'

import { Presentation, Sparkles } from 'lucide-react'

import { requirePageAuth } from '@/lib/auth/require-page-auth'

import { RevealPresentationWorkbench } from '@/components/presentations/reveal-presentation-workbench'

export const metadata: Metadata = {
  title: 'Brok Presentations',
  description:
    'Create and preview reveal.js-backed presentation decks inside Brok.'
}

export const dynamic = 'force-dynamic'

export default async function PresentationsPage() {
  await requirePageAuth('/presentations')

  return (
    <div className="dashboard-shell min-h-full w-full p-3 sm:p-4">
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4">
        <section className="dashboard-panel px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-xs text-muted-foreground">
                <Presentation className="size-3.5" />
                Brok Presentations
                <Sparkles className="size-3.5 text-primary" />
              </div>
              <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">
                Build a deck from the work in front of you.
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                Edit a lightweight slide script, preview it as a real reveal.js
                deck, and keep speaker notes beside the narrative.
              </p>
            </div>
          </div>
        </section>

        <RevealPresentationWorkbench />
      </div>
    </div>
  )
}
