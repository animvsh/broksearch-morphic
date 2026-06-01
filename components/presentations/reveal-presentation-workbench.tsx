'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  ArrowLeft,
  ArrowRight,
  Copy,
  Download,
  FilePlus2,
  FolderOpen,
  Loader2,
  Presentation,
  RotateCcw,
  Save,
  Share2,
  Sparkles,
  Trash2
} from 'lucide-react'
import type { RevealApi } from 'reveal.js'

import {
  parsePresentationMarkdown,
  samplePresentationSource
} from '@/lib/presentations/deck'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

import styles from './reveal-presentation-workbench.module.css'

type PresentationSummary = {
  id: string
  title: string
  description: string | null
  status: string
  slideCount: number
  isPublic: boolean
  shareId: string | null
  createdAt: string | Date
  updatedAt: string | Date
}

type PresentationDetail = PresentationSummary & {
  sourceMarkdown: string | null
}

type WorkbenchStatus = 'idle' | 'saving' | 'saved' | 'error' | 'loading'

const AUTOSAVE_DELAY_MS = 1500
const DEFAULT_TITLE = 'Untitled Presentation'

async function readApiError(response: Response, fallback: string) {
  try {
    const data = (await response.json()) as {
      error?: { message?: string }
      message?: string
    }
    return data.error?.message ?? data.message ?? fallback
  } catch {
    return fallback
  }
}

export function RevealPresentationWorkbench() {
  const [decks, setDecks] = useState<PresentationSummary[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [title, setTitle] = useState(DEFAULT_TITLE)
  const [source, setSource] = useState(samplePresentationSource)
  const [status, setStatus] = useState<WorkbenchStatus>('idle')
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [isPublic, setIsPublic] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generatePrompt, setGeneratePrompt] = useState('')
  const [showGeneratePanel, setShowGeneratePanel] = useState(false)
  const [showDeckList, setShowDeckList] = useState(false)

  const [selectedSlide, setSelectedSlide] = useState(0)
  const [isRevealReady, setIsRevealReady] = useState(false)
  const [revealError, setRevealError] = useState<string | null>(null)
  const revealElementRef = useRef<HTMLDivElement | null>(null)
  const revealRef = useRef<RevealApi | null>(null)
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestSourceRef = useRef(source)
  const latestTitleRef = useRef(title)

  const slides = useMemo(() => parsePresentationMarkdown(source), [source])
  const hasActiveDeck = Boolean(activeId)
  const deckListLabel =
    decks.length === 0
      ? 'Open'
      : `Open ${decks.length} deck${decks.length === 1 ? '' : 's'}`

  useEffect(() => {
    latestSourceRef.current = source
  }, [source])
  useEffect(() => {
    latestTitleRef.current = title
  }, [title])

  const loadDecks = useCallback(async () => {
    setStatus('loading')
    setStatusMessage(null)
    try {
      const res = await fetch('/api/presentations', { cache: 'no-store' })
      if (!res.ok) {
        throw new Error(
          await readApiError(res, `Failed to list decks (${res.status})`)
        )
      }
      const data = (await res.json()) as {
        presentations: PresentationSummary[]
      }
      setDecks(data.presentations)
      setStatus('idle')
    } catch (error) {
      setStatus('error')
      setStatusMessage(
        error instanceof Error ? error.message : 'Failed to load decks.'
      )
    }
  }, [])

  const loadDeck = useCallback(async (id: string) => {
    setStatus('loading')
    setStatusMessage(null)
    try {
      const res = await fetch(`/api/presentations/${id}`, {
        cache: 'no-store'
      })
      if (!res.ok) {
        throw new Error(
          await readApiError(res, `Failed to load deck (${res.status})`)
        )
      }
      const data = (await res.json()) as {
        presentation: PresentationDetail
      }
      setActiveId(data.presentation.id)
      setTitle(data.presentation.title)
      setSource(data.presentation.sourceMarkdown ?? samplePresentationSource)
      setIsPublic(data.presentation.isPublic)
      setShareUrl(
        data.presentation.isPublic && data.presentation.shareId
          ? `${window.location.origin}/p/${data.presentation.shareId}`
          : null
      )
      setSelectedSlide(0)
      setStatus('idle')
    } catch (error) {
      setStatus('error')
      setStatusMessage(
        error instanceof Error ? error.message : 'Failed to load deck.'
      )
    }
  }, [])

  useEffect(() => {
    void loadDecks()
  }, [loadDecks])

  useEffect(() => {
    let cancelled = false

    async function bootReveal() {
      if (!revealElementRef.current || revealRef.current) return

      try {
        setRevealError(null)
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
      } catch (error) {
        if (cancelled) return
        setRevealError(
          error instanceof Error
            ? error.message
            : 'Reveal preview failed to initialize.'
        )
      }
    }

    void bootReveal()

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
    const deck = revealRef.current
    deck?.sync()
    deck?.layout()
    deck?.slide(selectedSlide, 0, -1)
  }, [isRevealReady, selectedSlide, slides])

  const persistCurrent = useCallback(
    async (
      nextSource: string,
      nextTitle: string,
      options: { showStatus?: boolean } = {}
    ) => {
      if (!activeId) return
      const showStatus = options.showStatus !== false
      if (showStatus) {
        setStatus('saving')
        setStatusMessage(null)
      }
      try {
        const res = await fetch(`/api/presentations/${activeId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourceMarkdown: nextSource, title: nextTitle })
        })
        if (!res.ok) {
          throw new Error(
            await readApiError(res, `Save failed (${res.status})`)
          )
        }
        if (showStatus) {
          setStatus('saved')
          setStatusMessage('Saved')
        }
        void loadDecks()
      } catch (error) {
        setStatus('error')
        setStatusMessage(
          error instanceof Error ? error.message : 'Save failed.'
        )
      }
    },
    [activeId, loadDecks]
  )

  useEffect(() => {
    if (!activeId) return
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
    autosaveTimerRef.current = setTimeout(() => {
      void persistCurrent(latestSourceRef.current, latestTitleRef.current, {
        showStatus: false
      })
    }, AUTOSAVE_DELAY_MS)
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
    }
  }, [source, title, activeId, persistCurrent])

  const currentSlide = slides[selectedSlide]

  const addSlide = () => {
    const nextSlide = `\n\n---\n\n# New Slide\nkicker: Draft\nWrite the main point here.\n- Add a proof point\n- Add the user takeaway`
    setSource(value => `${value.trimEnd()}${nextSlide}`)
    setSelectedSlide(slides.length)
  }

  const goToSlide = (index: number) => {
    const nextIndex = Math.min(Math.max(index, 0), slides.length - 1)
    setSelectedSlide(nextIndex)
  }

  const handleNewDeck = async () => {
    setStatus('saving')
    setStatusMessage(null)
    const nextTitle = (latestTitleRef.current || DEFAULT_TITLE)
      .trim()
      .slice(0, 200)
    const nextSource = latestSourceRef.current || samplePresentationSource
    try {
      const res = await fetch('/api/presentations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: nextTitle || DEFAULT_TITLE })
      })
      if (!res.ok) {
        throw new Error(
          await readApiError(res, `Create failed (${res.status})`)
        )
      }
      const data = (await res.json()) as { presentation: PresentationDetail }
      const createdId = data.presentation.id

      const saveDraft = await fetch(`/api/presentations/${createdId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceMarkdown: nextSource,
          title: nextTitle || DEFAULT_TITLE
        })
      })
      if (!saveDraft.ok) {
        throw new Error(
          await readApiError(saveDraft, `Save failed (${saveDraft.status})`)
        )
      }

      setActiveId(createdId)
      setTitle(nextTitle || DEFAULT_TITLE)
      setSource(nextSource)
      setIsPublic(data.presentation.isPublic)
      setShareUrl(null)
      setSelectedSlide(0)
      await loadDecks()
      setStatus('saved')
      setStatusMessage('Deck created')
    } catch (error) {
      setStatus('error')
      setStatusMessage(
        error instanceof Error ? error.message : 'Failed to create deck.'
      )
    }
  }

  const handleSaveNow = async () => {
    if (!activeId) {
      await handleNewDeck()
      return
    }
    await persistCurrent(source, title)
  }

  const handleReset = () => {
    setSource(samplePresentationSource)
    setSelectedSlide(0)
  }

  const handleDelete = async () => {
    if (!activeId) return
    if (!window.confirm('Delete this presentation? This cannot be undone.')) {
      return
    }
    setStatus('saving')
    setStatusMessage(null)
    try {
      const res = await fetch(`/api/presentations/${activeId}`, {
        method: 'DELETE'
      })
      if (!res.ok) {
        throw new Error(
          await readApiError(res, `Delete failed (${res.status})`)
        )
      }
      setActiveId(null)
      setSource(samplePresentationSource)
      setTitle(DEFAULT_TITLE)
      setShareUrl(null)
      setIsPublic(false)
      await loadDecks()
      setStatus('idle')
    } catch (error) {
      setStatus('error')
      setStatusMessage(
        error instanceof Error ? error.message : 'Failed to delete deck.'
      )
    }
  }

  const handleGenerate = async () => {
    if (!activeId) {
      setStatus('error')
      setStatusMessage('Create or open a deck before generating.')
      return
    }
    const prompt = generatePrompt.trim()
    if (!prompt) {
      setStatus('error')
      setStatusMessage('Enter a generation prompt.')
      return
    }
    setGenerating(true)
    setStatus('saving')
    setStatusMessage('Generating deck…')
    try {
      const res = await fetch(`/api/presentations/${activeId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      })
      if (!res.ok) {
        throw new Error(
          await readApiError(res, `Generate failed (${res.status})`)
        )
      }
      const data = (await res.json()) as {
        ok: boolean
        generator: 'llm' | 'fallback'
        slideCount: number
        sourceMarkdown: string
      }
      setSource(data.sourceMarkdown)
      setStatus('saved')
      setStatusMessage(
        `Generated ${data.slideCount} slides via ${data.generator === 'llm' ? 'Brok' : 'fallback'} generator.`
      )
      setShowGeneratePanel(false)
      setGeneratePrompt('')
      await loadDecks()
    } catch (error) {
      setStatus('error')
      setStatusMessage(
        error instanceof Error ? error.message : 'Generation failed.'
      )
    } finally {
      setGenerating(false)
    }
  }

  const handleShareToggle = async () => {
    if (!activeId) return
    const nextValue = !isPublic
    setStatus('saving')
    setStatusMessage(null)
    try {
      const res = await fetch(`/api/presentations/${activeId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublic: nextValue })
      })
      if (!res.ok) {
        throw new Error(await readApiError(res, `Share failed (${res.status})`))
      }
      const data = (await res.json()) as {
        isPublic: boolean
        shareId: string | null
        shareUrl: string | null
      }
      setIsPublic(data.isPublic)
      setShareUrl(data.shareUrl)
      setStatus('saved')
      setStatusMessage(data.isPublic ? 'Sharing enabled' : 'Sharing disabled')
    } catch (error) {
      setStatus('error')
      setStatusMessage(
        error instanceof Error ? error.message : 'Share toggle failed.'
      )
    }
  }

  const handleExport = (format: 'markdown' | 'html') => {
    if (!activeId) return
    window.open(
      `/api/presentations/${activeId}/export?format=${format}`,
      '_blank',
      'noopener'
    )
  }

  const handleCopyShare = async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setStatus('saved')
      setStatusMessage('Share link copied to clipboard.')
    } catch {
      setStatus('error')
      setStatusMessage('Could not copy share link.')
    }
  }

  return (
    <div className="grid min-h-0 min-w-0 gap-4 xl:grid-cols-[minmax(320px,0.82fr)_minmax(520px,1.18fr)]">
      <section className="dashboard-panel flex min-h-0 min-w-0 flex-col overflow-hidden">
        <div className="flex flex-col gap-3 border-b px-4 py-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
                <Presentation className="size-3.5" />
                Source
              </div>
              <h2 className="mt-1 text-lg font-semibold tracking-normal">
                Editable deck script
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-2"
                onClick={handleNewDeck}
                data-testid="new-deck"
              >
                <FilePlus2 className="size-4" />
                New
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-2"
                onClick={() => setShowDeckList(value => !value)}
                data-testid="open-deck-list"
              >
                <FolderOpen className="size-4" />
                {deckListLabel}
              </Button>
            </div>
          </div>
          <Input
            aria-label="Deck title"
            value={title}
            onChange={event => setTitle(event.target.value)}
            className="h-9 text-sm font-medium"
            placeholder="Deck title"
          />
          {showDeckList ? (
            <div className="max-h-56 overflow-y-auto rounded-md border bg-white">
              {status === 'loading' ? (
                <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading decks
                </div>
              ) : decks.length > 0 ? (
                decks.map(deck => (
                  <button
                    key={deck.id}
                    type="button"
                    className={`flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-zinc-50 ${
                      deck.id === activeId ? 'bg-zinc-100' : ''
                    }`}
                    onClick={() => {
                      void loadDeck(deck.id)
                      setShowDeckList(false)
                    }}
                  >
                    <span className="min-w-0 truncate">{deck.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {deck.slideCount} slides
                    </span>
                  </button>
                ))
              ) : (
                <div className="px-3 py-3 text-sm text-muted-foreground">
                  No saved decks yet. Create one from the current draft.
                </div>
              )}
            </div>
          ) : null}
          {!hasActiveDeck ? (
            <div className="rounded-md border border-dashed bg-zinc-50 px-3 py-3 text-sm text-muted-foreground">
              You are editing a local draft. Create a deck to save, generate,
              share, or export it.
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              className="h-8 gap-2"
              onClick={handleSaveNow}
              disabled={status === 'saving'}
              data-testid="save-deck"
            >
              {status === 'saving' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              {hasActiveDeck ? 'Save' : 'Create'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-2"
              onClick={() => setShowGeneratePanel(value => !value)}
              disabled={!hasActiveDeck}
              data-testid="open-generate"
            >
              <Sparkles className="size-4" />
              Generate
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-2"
              onClick={addSlide}
              disabled={!hasActiveDeck}
            >
              <FilePlus2 className="size-4" />
              Slide
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-2"
              onClick={handleReset}
              disabled={!hasActiveDeck}
            >
              <RotateCcw className="size-4" />
              Reset
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-2"
              onClick={handleShareToggle}
              disabled={!hasActiveDeck}
              data-testid="share-toggle"
            >
              <Share2 className="size-4" />
              {isPublic ? 'Unshare' : 'Share'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-2"
              onClick={() => handleExport('markdown')}
              disabled={!hasActiveDeck}
            >
              <Download className="size-4" />
              MD
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-2"
              onClick={() => handleExport('html')}
              disabled={!hasActiveDeck}
            >
              <Download className="size-4" />
              HTML
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-2 text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={handleDelete}
              disabled={!hasActiveDeck}
            >
              <Trash2 className="size-4" />
              Delete
            </Button>
          </div>
          {showGeneratePanel ? (
            <div className="rounded-md border bg-white p-3">
              <label
                htmlFor="generate-prompt"
                className="text-xs font-medium uppercase text-muted-foreground"
              >
                Generate from prompt
              </label>
              <Textarea
                id="generate-prompt"
                value={generatePrompt}
                onChange={event => setGeneratePrompt(event.target.value)}
                placeholder="Describe the deck you want — topic, audience, tone, length…"
                className="mt-2 min-h-24"
              />
              <div className="mt-2 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowGeneratePanel(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 gap-2"
                  onClick={handleGenerate}
                  disabled={generating}
                  data-testid="run-generate"
                >
                  {generating ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                  {generating ? 'Generating…' : 'Generate'}
                </Button>
              </div>
            </div>
          ) : null}
          {shareUrl ? (
            <div className="flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm">
              <span className="truncate text-muted-foreground">{shareUrl}</span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="ml-auto h-7 gap-1 px-2"
                onClick={handleCopyShare}
              >
                <Copy className="size-3.5" />
                Copy
              </Button>
            </div>
          ) : null}
          {statusMessage ? (
            <p
              className={`text-xs ${
                status === 'error' ? 'text-red-600' : 'text-muted-foreground'
              }`}
              data-testid="workbench-status"
            >
              {statusMessage}
            </p>
          ) : null}
        </div>
        <textarea
          aria-label="Presentation markdown source"
          className={`${styles.editorTextarea} w-full flex-1 resize-none border-0 bg-white px-4 py-4 font-mono text-sm leading-6 text-zinc-900 outline-none placeholder:text-muted-foreground`}
          spellCheck={false}
          value={source}
          onChange={event => setSource(event.target.value)}
        />
      </section>

      <section className="flex min-h-0 min-w-0 flex-col gap-4">
        <div className="dashboard-panel overflow-hidden">
          <div className="flex flex-col gap-3 border-b px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="text-xs font-medium uppercase text-muted-foreground">
                reveal.js preview
              </div>
              <h2 className="mt-1 truncate text-lg font-semibold tracking-normal">
                {currentSlide?.title ?? title ?? 'Untitled deck'}
              </h2>
              {!hasActiveDeck ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Draft preview
                </p>
              ) : null}
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
              {!isRevealReady || revealError ? (
                <div className={styles.previewStatus}>
                  {revealError
                    ? `Preview unavailable: ${revealError}`
                    : 'Preparing reveal.js preview'}
                </div>
              ) : null}
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
