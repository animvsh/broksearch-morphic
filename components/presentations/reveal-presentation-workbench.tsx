'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  ArrowLeft,
  ArrowRight,
  Bot,
  ClipboardCopy,
  Copy,
  Download,
  FilePlus2,
  FolderOpen,
  GalleryVerticalEnd,
  ListPlus,
  Loader2,
  Maximize2,
  MessageSquareText,
  Presentation,
  RotateCcw,
  Save,
  Share2,
  Sparkles,
  Trash2,
  Upload,
  WandSparkles
} from 'lucide-react'
import type { RevealApi } from 'reveal.js'

import {
  parsePresentationMarkdown,
  samplePresentationSource
} from '@/lib/presentations/deck'
import { deterministicOutline } from '@/lib/presentations/generate'

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

const GENERATION_TONES = ['Academic', 'Pitch', 'Executive', 'Visual'] as const
const GENERATION_AUDIENCES = [
  'Classmates',
  'Professor',
  'Research group',
  'Hackathon judges'
] as const

const PROMPT_TEMPLATES = [
  {
    label: 'Class report',
    prompt:
      'Create a clear class presentation with an opening thesis, evidence slides, limitations, and a strong conclusion.'
  },
  {
    label: 'Research brief',
    prompt:
      'Turn these research notes into a source-aware presentation with claims, implications, and discussion questions.'
  },
  {
    label: 'Demo pitch',
    prompt:
      'Make a concise demo-day pitch deck with problem, solution, product flow, traction, and next steps.'
  }
] as const

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

function splitSourceIntoBlocks(source: string) {
  return source
    .trim()
    .split(/^\s*---+\s*$/m)
    .map(block => block.trim())
    .filter(Boolean)
}

function joinBlocks(blocks: string[]) {
  return blocks.map(block => block.trim()).join('\n\n---\n\n')
}

function appendLineIfMissing(block: string, line: string) {
  return block.toLowerCase().includes(line.toLowerCase())
    ? block
    : `${block.trimEnd()}\n${line}`
}

function selectedBlockIndex(selectedSlide: number, blockCount: number) {
  return Math.min(Math.max(selectedSlide, 0), Math.max(blockCount - 1, 0))
}

function firstMeaningfulLine(value: string) {
  return (
    value
      .split('\n')
      .map(line => line.trim())
      .find(Boolean) ?? 'Untitled presentation'
  )
}

function createOutlineFromMaterial(material: string, slideCount: number) {
  const cleaned = material.trim()
  const topic = firstMeaningfulLine(cleaned)
    .replace(/^#+\s*/, '')
    .replace(/[:.]\s*$/, '')
    .slice(0, 90)
  const supportingLines = cleaned
    .split(/\n+/)
    .map(line => line.replace(/^[-*#\d.]+\s*/, '').trim())
    .filter(line => line.length > 18)
    .slice(0, Math.max(slideCount - 2, 1))

  const beats = [
    `1. Hook: ${topic}`,
    `2. Problem: why this matters for the audience`,
    ...supportingLines.map((line, index) => `${index + 3}. Proof: ${line}`),
    `${Math.max(slideCount - 1, 3)}. Takeaway: what the audience should remember`,
    `${slideCount}. Next step: what to do after the talk`
  ]

  return beats
    .slice(0, slideCount)
    .map((beat, index) => {
      const normalized = beat.replace(/^\d+\.\s*/, '')
      return `${index + 1}. ${normalized}`
    })
    .join('\n')
}

function outlineToSlideMarkdown(outline: string, material: string) {
  const sourceMaterial = material.trim()
  const beats = outline
    .split('\n')
    .map(line => line.replace(/^[-*#\d.]+\s*/, '').trim())
    .filter(Boolean)

  const fallbackBeats = createOutlineFromMaterial(
    sourceMaterial || samplePresentationSource,
    6
  )
    .split('\n')
    .map(line => line.replace(/^[-*#\d.]+\s*/, '').trim())

  return (beats.length > 0 ? beats : fallbackBeats)
    .map((beat, index) => {
      const [rawTitle, ...rest] = beat.split(':')
      const title = (rawTitle || `Slide ${index + 1}`).trim()
      const detail = rest.join(':').trim()
      const context =
        detail ||
        sourceMaterial.split(/\n+/).find(line => line.trim().length > 24) ||
        'Add the strongest evidence, example, or classroom insight here.'

      return [
        `# ${title}`,
        index === 0 ? 'kicker: Opening move' : `kicker: Beat ${index + 1}`,
        context,
        '- Lead with the clearest claim',
        '- Add one concrete proof point',
        '- Connect it back to the audience',
        `notes: Explain why this beat matters before moving to slide ${index + 2}.`
      ].join('\n')
    })
    .join('\n\n---\n\n')
}

function outlineFromSlides(source: string) {
  return parsePresentationMarkdown(source)
    .map((slide, index) => {
      const detail =
        slide.kicker ?? slide.body[0] ?? slide.bullets[0] ?? 'Main point'
      return `${index + 1}. ${slide.title}: ${detail}`
    })
    .join('\n')
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
  const [generateTone, setGenerateTone] =
    useState<(typeof GENERATION_TONES)[number]>('Academic')
  const [generateAudience, setGenerateAudience] =
    useState<(typeof GENERATION_AUDIENCES)[number]>('Classmates')
  const [generateSlideCount, setGenerateSlideCount] = useState(8)
  const [generateWebSearch, setGenerateWebSearch] = useState(false)
  const [showGeneratePanel, setShowGeneratePanel] = useState(false)
  const [showDeckList, setShowDeckList] = useState(false)
  const [material, setMaterial] = useState(
    'Paste a lecture transcript, research notes, assignment prompt, or rough idea here.'
  )
  const [outline, setOutline] = useState(() =>
    outlineFromSlides(samplePresentationSource)
  )
  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState<
    Array<{ role: 'assistant' | 'user'; content: string }>
  >([
    {
      role: 'assistant',
      content:
        'Send me a direction like "make this more visual" or "add speaker notes" and I will edit the outline or deck.'
    }
  ])

  const [selectedSlide, setSelectedSlide] = useState(0)
  const [isRevealReady, setIsRevealReady] = useState(false)
  const [revealError, setRevealError] = useState<string | null>(null)
  const revealElementRef = useRef<HTMLDivElement | null>(null)
  const deckFrameRef = useRef<HTMLDivElement | null>(null)
  const revealRef = useRef<RevealApi | null>(null)
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestSourceRef = useRef(source)
  const latestTitleRef = useRef(title)

  const slides = useMemo(() => parsePresentationMarkdown(source), [source])
  const selectedSlideIndex = useMemo(
    () => selectedBlockIndex(selectedSlide, slides.length),
    [selectedSlide, slides.length]
  )
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
      setOutline(
        outlineFromSlides(
          data.presentation.sourceMarkdown ?? samplePresentationSource
        )
      )
      setMaterial(data.presentation.sourceMarkdown ?? samplePresentationSource)
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
    const bootstrapDecks = async () => {
      await loadDecks()
    }
    void bootstrapDecks()
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
    if (!isRevealReady) return
    const deck = revealRef.current
    deck?.sync()
    deck?.layout()
    deck?.slide(selectedSlideIndex, 0, -1)
  }, [isRevealReady, selectedSlideIndex, slides])

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

  const currentSlide = slides[selectedSlideIndex]

  const addSlide = () => {
    const nextSlide = `\n\n---\n\n# New Slide\nkicker: Draft\nWrite the main point here.\n- Add a proof point\n- Add the user takeaway`
    setSource(value => `${value.trimEnd()}${nextSlide}`)
    setOutline(
      value => `${value.trimEnd()}\n${slides.length + 1}. New Slide: Draft`
    )
    setSelectedSlide(selectedSlideIndex + 1)
  }

  const goToSlide = (index: number) => {
    const nextIndex = Math.min(Math.max(index, 0), slides.length - 1)
    setSelectedSlide(nextIndex)
  }

  const handleMaterialUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      setMaterial(text)
      setStatus('saved')
      setStatusMessage(`${file.name} added to source material`)
    } catch {
      setStatus('error')
      setStatusMessage('Could not read that file.')
    } finally {
      event.target.value = ''
    }
  }

  const handleCreateOutline = () => {
    const nextOutline = createOutlineFromMaterial(material, generateSlideCount)
    setOutline(nextOutline)
    setStatus('saved')
    setStatusMessage('Outline created')
  }

  const handleCreateSlidesFromOutline = () => {
    const nextSource = outlineToSlideMarkdown(outline, material)
    setSource(nextSource)
    setSelectedSlide(0)
    setShowGeneratePanel(false)
    setStatus('saved')
    setStatusMessage('Slides created from outline')
  }

  const appendAssistantMessage = (content: string) => {
    setChatMessages(messages => [...messages, { role: 'assistant', content }])
  }

  const runChatCommand = (command: string) => {
    const normalized = command.toLowerCase()
    setChatMessages(messages => [
      ...messages,
      { role: 'user', content: command }
    ])

    if (normalized.includes('note')) {
      addSpeakerNotes()
      appendAssistantMessage('Added speaker notes across the deck.')
      return
    }

    if (normalized.includes('agenda') || normalized.includes('outline')) {
      const nextOutline = createOutlineFromMaterial(
        `${material}\n${outline}`,
        generateSlideCount
      )
      setOutline(nextOutline)
      appendAssistantMessage('Reworked the outline into a cleaner sequence.')
      setStatus('saved')
      setStatusMessage('Outline updated from chat')
      return
    }

    if (
      normalized.includes('visual') ||
      normalized.includes('polish') ||
      normalized.includes('better')
    ) {
      polishDeck()
      appendAssistantMessage(
        'Polished the slide structure for a more visual pass.'
      )
      return
    }

    if (normalized.includes('slide') || normalized.includes('create')) {
      handleCreateSlidesFromOutline()
      appendAssistantMessage('Created a slide draft from the current outline.')
      return
    }

    setOutline(
      value =>
        `${value.trimEnd()}\n${value.trim() ? value.split('\n').length + 1 : 1}. ${command}`
    )
    appendAssistantMessage('Added that as a new outline beat.')
    setStatus('saved')
    setStatusMessage('Chat added to outline')
  }

  const handleChatSubmit = () => {
    const command = chatInput.trim()
    if (!command) return
    setChatInput('')
    runChatCommand(command)
  }

  const createDeckFromCurrent = async () => {
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
      setOutline(outlineFromSlides(nextSource))
      setIsPublic(data.presentation.isPublic)
      setShareUrl(null)
      setSelectedSlide(0)
      await loadDecks()
      setStatus('saved')
      setStatusMessage('Deck created')
      return createdId
    } catch (error) {
      setStatus('error')
      setStatusMessage(
        error instanceof Error ? error.message : 'Failed to create deck.'
      )
      return null
    }
  }

  const handleNewDeck = async () => {
    await createDeckFromCurrent()
  }

  const handleSaveNow = async () => {
    if (!activeId) {
      await createDeckFromCurrent()
      return
    }
    await persistCurrent(source, title)
  }

  const handleReset = () => {
    setSource(samplePresentationSource)
    setOutline(outlineFromSlides(samplePresentationSource))
    setMaterial(samplePresentationSource)
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
      setOutline(outlineFromSlides(samplePresentationSource))
      setMaterial(samplePresentationSource)
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
    const prompt = generatePrompt.trim()
    if (!prompt) {
      setStatus('error')
      setStatusMessage('Enter a generation prompt.')
      return
    }

    const deckId = activeId ?? (await createDeckFromCurrent())
    setGenerating(true)
    setStatus('saving')
    setStatusMessage('Generating deck…')

    if (!deckId) {
      const sourceMarkdown = deterministicOutline(prompt, generateSlideCount)
      setSource(sourceMarkdown)
      setOutline(outlineFromSlides(sourceMarkdown))
      setMaterial(prompt)
      setSelectedSlide(0)
      setStatus('saved')
      setStatusMessage(
        `Generated ${generateSlideCount} slides via local fallback. Save once presentation storage is available.`
      )
      setShowGeneratePanel(false)
      setGeneratePrompt('')
      setGenerating(false)
      return
    }

    try {
      const res = await fetch(`/api/presentations/${deckId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: [
            prompt,
            `Audience: ${generateAudience}.`,
            `Tone: ${generateTone}.`,
            `Target slide count: ${generateSlideCount}.`
          ].join('\n'),
          slideCount: generateSlideCount,
          webSearch: generateWebSearch
        })
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
      setOutline(outlineFromSlides(data.sourceMarkdown))
      setMaterial(prompt)
      await loadDecks()
      setStatus('saved')
      setStatusMessage(
        `Generated ${data.slideCount} slides via ${data.generator === 'llm' ? 'Brok' : 'fallback'} generator.`
      )
      setShowGeneratePanel(false)
      setGeneratePrompt('')
    } catch (error) {
      setStatus('error')
      setStatusMessage(
        error instanceof Error ? error.message : 'Generation failed.'
      )
    } finally {
      setGenerating(false)
    }
  }

  const updateShareState = async (deckId: string, nextValue: boolean) => {
    setStatus('saving')
    setStatusMessage(null)
    const res = await fetch(`/api/presentations/${deckId}/share`, {
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
    return data
  }

  const handleShareToggle = async () => {
    if (!activeId) return
    try {
      await updateShareState(activeId, !isPublic)
    } catch (error) {
      setStatus('error')
      setStatusMessage(
        error instanceof Error ? error.message : 'Share toggle failed.'
      )
    }
  }

  const handlePresentSlides = async () => {
    const target = deckFrameRef.current
    if (!target?.requestFullscreen) {
      setStatus('error')
      setStatusMessage('Fullscreen presenting is not available here.')
      return
    }

    try {
      await target.requestFullscreen()
      setStatus('saved')
      setStatusMessage('Presenting slides')
    } catch (error) {
      setStatus('error')
      setStatusMessage(
        error instanceof Error ? error.message : 'Could not enter present mode.'
      )
    }
  }

  const handleShareSlides = async () => {
    if (shareUrl) {
      await handleCopyShare()
      return
    }

    const deckId = activeId ?? (await createDeckFromCurrent())
    if (!deckId) return

    try {
      const data = await updateShareState(deckId, true)
      if (data.shareUrl) {
        try {
          await navigator.clipboard.writeText(data.shareUrl)
          setStatusMessage('Share link copied to clipboard.')
        } catch {
          setStatusMessage('Sharing enabled')
        }
      }
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

  const updateSourceWithBlocks = (
    blocks: string[],
    nextSlide = selectedSlideIndex,
    options: { syncOutline?: boolean } = {}
  ) => {
    const nextSource = joinBlocks(blocks)
    setSource(nextSource)
    if (options.syncOutline !== false) {
      setOutline(outlineFromSlides(nextSource))
    }
    setSelectedSlide(Math.min(Math.max(nextSlide, 0), blocks.length - 1))
  }

  const addAgendaSlide = () => {
    const titles = slides
      .slice(0, 6)
      .map(slide => `- ${slide.title}`)
      .join('\n')
    const agenda = `# Agenda\nkicker: Roadmap\n${titles || '- Opening context\n- Main argument\n- Next steps'}\nnotes: Preview the story before moving into the details.`
    updateSourceWithBlocks([agenda, ...splitSourceIntoBlocks(source)], 0)
    setStatus('saved')
    setStatusMessage('Agenda slide added')
  }

  const addRecapSlide = () => {
    const recap = `# Recap\nkicker: Takeaways\n- The central claim is clear\n- The strongest proof points are visible\n- The next step is easy to act on\nnotes: Close with the single sentence the audience should remember.`
    const blocks = splitSourceIntoBlocks(source)
    updateSourceWithBlocks([...blocks, recap], blocks.length)
    setStatus('saved')
    setStatusMessage('Recap slide added')
  }

  const addSpeakerNotes = () => {
    const blocks = splitSourceIntoBlocks(source).map((block, index) =>
      /(^|\n)notes:/i.test(block)
        ? block
        : `${block.trimEnd()}\nnotes: Introduce slide ${index + 1} with the punchline, then connect it to the deck narrative.`
    )
    updateSourceWithBlocks(blocks, selectedSlideIndex, { syncOutline: false })
    setStatus('saved')
    setStatusMessage('Speaker notes added')
  }

  const polishDeck = () => {
    const blocks = splitSourceIntoBlocks(source).map(block => {
      let next = block
      next = appendLineIfMissing(next, 'kicker: Key point')
      if (!/[-*]\s+/.test(next)) {
        next = `${next.trimEnd()}\n- Lead with the most important takeaway\n- Add one proof point\n- Close with the audience action`
      }
      return next
    })
    updateSourceWithBlocks(blocks)
    setStatus('saved')
    setStatusMessage('Deck structure polished')
  }

  const duplicateSlide = () => {
    const blocks = splitSourceIntoBlocks(source)
    const index = selectedBlockIndex(selectedSlideIndex, blocks.length)
    if (!blocks[index]) return
    const duplicate = blocks[index].replace(/^#\s+(.+)$/m, '# $1 Copy')
    blocks.splice(index + 1, 0, duplicate)
    updateSourceWithBlocks(blocks, index + 1)
    setStatus('saved')
    setStatusMessage('Slide duplicated')
  }

  const moveSlide = (direction: -1 | 1) => {
    const blocks = splitSourceIntoBlocks(source)
    const index = selectedBlockIndex(selectedSlideIndex, blocks.length)
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= blocks.length) return
    const [block] = blocks.splice(index, 1)
    blocks.splice(nextIndex, 0, block)
    updateSourceWithBlocks(blocks, nextIndex)
    setStatus('saved')
    setStatusMessage('Slide moved')
  }

  const deleteCurrentSlide = () => {
    const blocks = splitSourceIntoBlocks(source)
    if (blocks.length <= 1) {
      setStatus('error')
      setStatusMessage('A deck needs at least one slide.')
      return
    }
    const index = selectedBlockIndex(selectedSlideIndex, blocks.length)
    blocks.splice(index, 1)
    updateSourceWithBlocks(blocks, Math.max(index - 1, 0))
    setStatus('saved')
    setStatusMessage('Slide removed')
  }

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(source)
      setStatus('saved')
      setStatusMessage('Markdown copied')
    } catch {
      setStatus('error')
      setStatusMessage('Could not copy markdown.')
    }
  }

  const copyNotes = async () => {
    const notes = slides
      .map((slide, index) => `Slide ${index + 1}: ${slide.notes ?? 'No notes'}`)
      .join('\n')
    try {
      await navigator.clipboard.writeText(notes)
      setStatus('saved')
      setStatusMessage('Speaker notes copied')
    } catch {
      setStatus('error')
      setStatusMessage('Could not copy speaker notes.')
    }
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
      <section className="dashboard-panel flex min-h-0 min-w-0 flex-col overflow-y-auto">
        <div className="flex flex-col gap-3 border-b px-4 py-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
                <Presentation className="size-3.5" />
                Cursor for slides
              </div>
              <h2 className="mt-1 text-lg font-semibold tracking-normal">
                Notes to outline to deck
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
              You are editing a local draft. Create a deck to save, share, or
              export it.
            </div>
          ) : null}
          <div className="grid gap-3 rounded-md border bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="presentation-material"
                className="text-xs font-medium uppercase text-muted-foreground"
              >
                Upload or paste info
              </label>
              <label className="relative inline-flex h-11 min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-zinc-50">
                <Upload className="size-4" />
                Upload
                <input
                  type="file"
                  accept=".txt,.md,.markdown,text/plain,text/markdown"
                  id="presentation-material-upload"
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  aria-label="Upload presentation source file"
                  onChange={event => {
                    void handleMaterialUpload(event)
                  }}
                />
              </label>
            </div>
            <Textarea
              id="presentation-material"
              aria-label="Presentation source material"
              value={material}
              onChange={event => setMaterial(event.target.value)}
              className="min-h-28 text-sm leading-6"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                className="h-11 min-h-11 gap-2"
                onClick={handleCreateOutline}
                data-testid="create-outline"
              >
                <ListPlus className="size-4" />
                Create outline
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-11 min-h-11 gap-2"
                onClick={handleCreateSlidesFromOutline}
                data-testid="create-slides"
              >
                <Presentation className="size-4" />
                Create slides
              </Button>
            </div>
          </div>
          <div className="grid gap-3 rounded-md border bg-white p-3">
            <label
              htmlFor="presentation-outline"
              className="text-xs font-medium uppercase text-muted-foreground"
            >
              Editable outline
            </label>
            <Textarea
              id="presentation-outline"
              aria-label="Editable presentation outline"
              value={outline}
              onChange={event => setOutline(event.target.value)}
              className="min-h-36 font-mono text-sm leading-6"
            />
          </div>
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
          <div className="grid gap-3 rounded-md border bg-white p-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
                  <WandSparkles className="size-3.5" />
                  AI presentation tools
                </div>
                <div className="mt-1 text-sm font-medium text-zinc-900">
                  Build, polish, reorder, and package the deck.
                </div>
              </div>
              <span className="text-xs text-muted-foreground">
                {slides.length} slide{slides.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <ToolButton
                icon={ListPlus}
                label="Agenda"
                onClick={addAgendaSlide}
              />
              <ToolButton
                icon={GalleryVerticalEnd}
                label="Recap"
                onClick={addRecapSlide}
              />
              <ToolButton
                icon={MessageSquareText}
                label="Speaker notes"
                onClick={addSpeakerNotes}
              />
              <ToolButton icon={Sparkles} label="Polish" onClick={polishDeck} />
              <ToolButton
                icon={Copy}
                label="Duplicate slide"
                onClick={duplicateSlide}
              />
              <ToolButton
                icon={Trash2}
                label="Remove slide"
                onClick={deleteCurrentSlide}
              />
              <ToolButton
                icon={ArrowLeft}
                label="Move left"
                onClick={() => moveSlide(-1)}
              />
              <ToolButton
                icon={ArrowRight}
                label="Move right"
                onClick={() => moveSlide(1)}
              />
              <ToolButton
                icon={ClipboardCopy}
                label="Copy markdown"
                onClick={copyMarkdown}
              />
              <ToolButton
                icon={MessageSquareText}
                label="Copy notes"
                onClick={copyNotes}
              />
            </div>
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
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                  Audience
                  <select
                    value={generateAudience}
                    onChange={event =>
                      setGenerateAudience(
                        event.target
                          .value as (typeof GENERATION_AUDIENCES)[number]
                      )
                    }
                    className="h-9 rounded-md border bg-white px-2 text-sm text-zinc-900"
                  >
                    {GENERATION_AUDIENCES.map(audience => (
                      <option key={audience} value={audience}>
                        {audience}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                  Tone
                  <select
                    value={generateTone}
                    onChange={event =>
                      setGenerateTone(
                        event.target.value as (typeof GENERATION_TONES)[number]
                      )
                    }
                    className="h-9 rounded-md border bg-white px-2 text-sm text-zinc-900"
                  >
                    {GENERATION_TONES.map(tone => (
                      <option key={tone} value={tone}>
                        {tone}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                  Slides
                  <input
                    type="number"
                    min={3}
                    max={24}
                    value={generateSlideCount}
                    onChange={event =>
                      setGenerateSlideCount(
                        Math.min(
                          24,
                          Math.max(3, Number(event.target.value) || 3)
                        )
                      )
                    }
                    className="h-9 rounded-md border bg-white px-2 text-sm text-zinc-900"
                  />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {PROMPT_TEMPLATES.map(template => (
                  <Button
                    key={template.label}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => setGeneratePrompt(template.prompt)}
                  >
                    {template.label}
                  </Button>
                ))}
              </div>
              <label className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={generateWebSearch}
                  onChange={event => setGenerateWebSearch(event.target.checked)}
                  className="size-4 rounded border"
                />
                Use web search when available
              </label>
              <div className="mt-3 flex justify-end gap-2">
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
          <div className="grid gap-3 rounded-md border bg-white p-3">
            <div className="flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
              <Bot className="size-3.5" />
              Slide chat
            </div>
            <div className="max-h-52 space-y-2 overflow-y-auto rounded-md bg-zinc-50 p-2">
              {chatMessages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`rounded-md px-3 py-2 text-sm leading-6 ${
                    message.role === 'user'
                      ? 'ml-8 bg-zinc-950 text-white'
                      : 'mr-8 border bg-white text-zinc-700'
                  }`}
                >
                  {message.content}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                aria-label="Chat with slide builder"
                value={chatInput}
                onChange={event => setChatInput(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    handleChatSubmit()
                  }
                }}
                placeholder="Ask for a tighter outline, notes, visuals..."
                className="h-9 text-sm"
              />
              <Button
                type="button"
                size="sm"
                className="h-9"
                onClick={handleChatSubmit}
              >
                Send
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {['Make it visual', 'Add speaker notes', 'Create slides'].map(
                command => (
                  <Button
                    key={command}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => runChatCommand(command)}
                  >
                    {command}
                  </Button>
                )
              )}
            </div>
          </div>
        </div>
        <textarea
          aria-label="Presentation markdown source"
          className={`${styles.editorTextarea} min-h-48 w-full resize-y border-0 bg-white px-4 py-4 font-mono text-sm leading-6 text-zinc-900 outline-none placeholder:text-muted-foreground`}
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
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                size="sm"
                className="h-8 gap-2"
                onClick={() => {
                  void handlePresentSlides()
                }}
                data-testid="present-slides"
              >
                <Maximize2 className="size-4" />
                Present
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-2"
                onClick={() => {
                  void handleShareSlides()
                }}
                disabled={status === 'saving'}
                data-testid="share-slides"
              >
                <Share2 className="size-4" />
                {shareUrl ? 'Copy share' : 'Share'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                aria-label="Previous slide"
                disabled={selectedSlideIndex === 0}
                onClick={() => goToSlide(selectedSlideIndex - 1)}
              >
                <ArrowLeft className="size-4" />
              </Button>
              <span className="min-w-20 text-center text-sm text-muted-foreground">
                {selectedSlideIndex + 1} / {slides.length}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                aria-label="Next slide"
                disabled={selectedSlideIndex >= slides.length - 1}
                onClick={() => goToSlide(selectedSlideIndex + 1)}
              >
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>

          <div className={`${styles.previewShell} p-3 sm:p-4`}>
            <div
              ref={deckFrameRef}
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
                    index === selectedSlideIndex
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

function ToolButton({
  icon: Icon,
  label,
  onClick
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-8 justify-start gap-2"
      onClick={onClick}
    >
      <Icon className="size-4" />
      {label}
    </Button>
  )
}
