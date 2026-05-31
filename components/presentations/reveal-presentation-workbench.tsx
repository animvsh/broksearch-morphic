'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import {
  ArrowLeft,
  ArrowRight,
  FilePlus2,
  Presentation,
  RotateCcw
} from 'lucide-react'
import type { RevealApi } from 'reveal.js'

import {
  parsePresentationMarkdown,
  samplePresentationSource
} from '@/lib/presentations/deck'

import { Button } from '@/components/ui/button'

import styles from './reveal-presentation-workbench.module.css'

export function RevealPresentationWorkbench() {
  const [source, setSource] = useState(samplePresentationSource)
  const slides = useMemo(() => parsePresentationMarkdown(source), [source])
  const [selectedSlide, setSelectedSlide] = useState(0)
  const [isRevealReady, setIsRevealReady] = useState(false)
  const revealElementRef = useRef<HTMLDivElement | null>(null)
  const revealRef = useRef<RevealApi | null>(null)

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
        keyboard: false,
        overview: false,
        touch: false,
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

    bootReveal()

    return () => {
      cancelled = true
      revealRef.current?.destroy()
      revealRef.current = null
    }
  }, [])

  useEffect(() => {
    setSelectedSlide(current =>
      Math.min(current, Math.max(slides.length - 1, 0))
    )
  }, [slides.length])

  useEffect(() => {
    if (!isRevealReady) return

    revealRef.current?.sync()
    revealRef.current?.slide(selectedSlide, 0, -1)
  }, [isRevealReady, selectedSlide, slides])

  const currentSlide = slides[selectedSlide]

  const addSlide = () => {
    const nextSlide = `\n\n---\n\n# New Slide\nKicker: Draft\nWrite the main point here.\n- Add a proof point\n- Add the user takeaway`
    setSource(value => `${value.trimEnd()}${nextSlide}`)
    setSelectedSlide(slides.length)
  }

  const goToSlide = (index: number) => {
    const nextIndex = Math.min(Math.max(index, 0), slides.length - 1)
    setSelectedSlide(nextIndex)
  }

  return (
    <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(320px,0.82fr)_minmax(520px,1.18fr)]">
      <section className="dashboard-panel flex min-h-0 flex-col overflow-hidden">
        <div className="flex flex-col gap-3 border-b px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
              <Presentation className="size-3.5" />
              Source
            </div>
            <h2 className="mt-1 text-lg font-semibold tracking-normal">
              Editable deck script
            </h2>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-2"
              onClick={() => setSource(samplePresentationSource)}
            >
              <RotateCcw className="size-4" />
              Reset
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 gap-2"
              aria-label="Add slide"
              onClick={addSlide}
            >
              <FilePlus2 className="size-4" />
              Slide
            </Button>
          </div>
        </div>
        <textarea
          aria-label="Presentation markdown source"
          className={`${styles.editorTextarea} w-full flex-1 resize-none border-0 bg-white px-4 py-4 font-mono text-sm leading-6 text-zinc-900 outline-none placeholder:text-muted-foreground`}
          spellCheck={false}
          value={source}
          onChange={event => setSource(event.target.value)}
        />
      </section>

      <section className="flex min-h-0 flex-col gap-4">
        <div className="dashboard-panel overflow-hidden">
          <div className="flex flex-col gap-3 border-b px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="text-xs font-medium uppercase text-muted-foreground">
                reveal.js preview
              </div>
              <h2 className="mt-1 truncate text-lg font-semibold tracking-normal">
                {currentSlide?.title ?? 'Untitled deck'}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                aria-label="Previous slide"
                disabled={selectedSlide === 0}
                onClick={() => goToSlide(selectedSlide - 1)}
              >
                <ArrowLeft className="size-4" />
              </Button>
              <span className="min-w-20 text-center text-sm text-muted-foreground">
                {selectedSlide + 1} / {slides.length}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                aria-label="Next slide"
                disabled={selectedSlide >= slides.length - 1}
                onClick={() => goToSlide(selectedSlide + 1)}
              >
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>

          <div className={`${styles.previewShell} p-3 sm:p-4`}>
            <div
              className={`${styles.deckFrame} rounded-lg border border-white/10 shadow-2xl`}
            >
              <div
                ref={revealElementRef}
                className={`${styles.revealRoot} reveal`}
                data-testid="reveal-deck"
              >
                <div className="slides">
                  {slides.map(slide => (
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
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[0.8fr_1.2fr]">
          <section className="dashboard-panel p-4">
            <h3 className="text-sm font-semibold">Outline</h3>
            <div className="mt-3 grid gap-2">
              {slides.map((slide, index) => (
                <button
                  key={slide.id}
                  type="button"
                  className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                    index === selectedSlide
                      ? 'border-zinc-950 bg-zinc-950 text-white'
                      : 'border-border bg-white text-zinc-700 hover:bg-zinc-50'
                  }`}
                  onClick={() => goToSlide(index)}
                >
                  <span className="block text-xs opacity-70">
                    Slide {index + 1}
                  </span>
                  <span className="block truncate font-medium">
                    {slide.title}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="dashboard-panel p-4">
            <h3 className="text-sm font-semibold">Speaker notes</h3>
            <p className="mt-2 min-h-16 text-sm leading-6 text-muted-foreground">
              {currentSlide?.notes ??
                'Add a Notes: line to any slide to keep delivery cues beside the deck.'}
            </p>
          </section>
        </div>
      </section>
    </div>
  )
}
