'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import { ArrowLeft, ArrowRight, Presentation } from 'lucide-react'
import type { RevealApi } from 'reveal.js'

import { Button } from '@/components/ui/button'

import styles from './reveal-presentation-workbench.module.css'

type PublicSlide = {
  id: string
  title: string
  kicker?: string | null
  body: string[]
  bullets: string[]
  notes?: string | null
}

type PublicRevealViewerProps = {
  title: string
  description?: string | null
  slides: PublicSlide[]
}

export function PublicRevealViewer({
  title,
  description,
  slides
}: PublicRevealViewerProps) {
  const [selectedSlide, setSelectedSlide] = useState(0)
  const [isRevealReady, setIsRevealReady] = useState(false)
  const revealElementRef = useRef<HTMLDivElement | null>(null)
  const revealRef = useRef<RevealApi | null>(null)
  const safeSlides = useMemo(() => slides.filter(Boolean), [slides])

  useEffect(() => {
    let cancelled = false

    async function bootReveal() {
      if (!revealElementRef.current || revealRef.current) return

      const { default: Reveal } = await import('reveal.js')
      const deck = new Reveal(revealElementRef.current, {
        embedded: true,
        controls: false,
        progress: false,
        hash: false,
        keyboard: true,
        overview: false,
        touch: true,
        transition: 'slide',
        width: 1280,
        height: 720,
        margin: 0
      })

      await deck.initialize()

      if (cancelled) {
        deck.destroy()
        return
      }

      revealRef.current = deck
      setIsRevealReady(true)
    }

    void bootReveal()

    return () => {
      cancelled = true
      revealRef.current?.destroy()
      revealRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!isRevealReady) return
    revealRef.current?.sync()
    revealRef.current?.slide(selectedSlide, 0, -1)
  }, [isRevealReady, selectedSlide, safeSlides])

  const goToSlide = (index: number) => {
    setSelectedSlide(Math.min(Math.max(index, 0), safeSlides.length - 1))
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-3 py-4 text-white sm:px-5 sm:py-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs text-zinc-300">
              <Presentation className="size-3.5" />
              Brok Presentations
            </div>
            <h1 className="truncate text-2xl font-semibold tracking-normal sm:text-3xl">
              {title}
            </h1>
            {description ? (
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">
                {description}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-8 border-white/20 bg-white/10 p-0 text-white hover:bg-white/15"
              aria-label="Previous slide"
              disabled={selectedSlide === 0}
              onClick={() => goToSlide(selectedSlide - 1)}
            >
              <ArrowLeft className="size-4" />
            </Button>
            <span className="min-w-20 text-center text-sm text-zinc-300">
              {safeSlides.length > 0 ? selectedSlide + 1 : 0} /{' '}
              {safeSlides.length}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-8 border-white/20 bg-white/10 p-0 text-white hover:bg-white/15"
              aria-label="Next slide"
              disabled={selectedSlide >= safeSlides.length - 1}
              onClick={() => goToSlide(selectedSlide + 1)}
            >
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </header>

        <section className={`${styles.previewShell} rounded-lg p-3 sm:p-4`}>
          <div
            className={`${styles.deckFrame} rounded-lg border border-white/10 shadow-2xl`}
          >
            <div
              ref={revealElementRef}
              className={`${styles.revealRoot} reveal`}
              data-testid="public-reveal-deck"
            >
              <div className="slides">
                {safeSlides.map(slide => (
                  <section key={slide.id} data-slide-id={slide.id}>
                    {slide.kicker ? (
                      <div className="slide-kicker">{slide.kicker}</div>
                    ) : null}
                    <h2>{slide.title}</h2>
                    {slide.body.map(paragraph => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                    {slide.bullets.length > 0 ? (
                      <ul>
                        {slide.bullets.map(bullet => (
                          <li key={bullet}>{bullet}</li>
                        ))}
                      </ul>
                    ) : null}
                    {slide.notes ? (
                      <aside className="notes">{slide.notes}</aside>
                    ) : null}
                  </section>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
