'use client'

import React, { useCallback, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { ArrowLeftIcon, Loader2Icon, SettingsIcon } from 'lucide-react'

import type {
  Presentation,
  PresentationStatus
} from '@/lib/presentations/types'
import { cn } from '@/lib/utils'

import { Button } from '@/components/ui/button'

import {
  GenerationProgress,
  OutlineChatBar,
  OutlineEditor
} from '@/components/presentations/outline'
import type { OutlineSlide } from '@/components/presentations/outline/types'

interface PresentationWithOutline extends Presentation {
  outline?: { slides: OutlineSlide[] }
}

interface PresentationsOutlinePageProps {
  params: Promise<{ id: string }>
}

export default function PresentationsOutlinePage({
  params
}: PresentationsOutlinePageProps) {
  const router = useRouter()
  const [presentation, setPresentation] =
    useState<PresentationWithOutline | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isGeneratingSlides, setIsGeneratingSlides] = useState(false)
  const [outlineId, setOutlineId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const autoGenerationStarted = React.useRef(false)

  const consumeSseResponse = useCallback(
    async (
      response: Response,
      handlers?: {
        onComplete?: () => void
        onDeckComplete?: () => void
      }
    ) => {
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.error || 'Generation request failed')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() || ''

        for (const event of events) {
          const line = event
            .split('\n')
            .find(candidate => candidate.startsWith('data: '))

          if (!line) {
            continue
          }

          const payload = JSON.parse(line.slice(6))
          if (payload.type === 'outline_complete') {
            handlers?.onComplete?.()
          }
          if (payload.type === 'deck_complete') {
            handlers?.onDeckComplete?.()
          }
          if (payload.type === 'error') {
            throw new Error(payload.data?.error || 'Generation failed')
          }
        }
      }
    },
    []
  )

  // Load presentation on mount
  React.useEffect(() => {
    const loadPresentation = async () => {
      try {
        const resolvedParams = await params
        setOutlineId(resolvedParams.id)

        const response = await fetch(`/api/presentations/${resolvedParams.id}`)

        if (!response.ok) {
          const data = await response.json().catch(() => null)
          throw new Error(data?.error || 'Failed to load presentation')
        }

        const data = await response.json()
        setPresentation(data)
      } catch (error) {
        console.error('Error loading presentation:', error)
        setLoadError(
          error instanceof Error ? error.message : 'Failed to load presentation'
        )
      } finally {
        setIsLoading(false)
      }
    }

    loadPresentation()
  }, [params])

  const handleOutlineChange = useCallback((outline: OutlineSlide[]) => {
    // Could be used to update local state or track unsaved changes
  }, [])

  const handleOutlineUpdated = useCallback(() => {
    // Refresh the presentation data
    if (outlineId) {
      fetch(`/api/presentations/${outlineId}`)
        .then(res => res.ok && res.json())
        .then(data => {
          if (data) setPresentation(data)
        })
        .catch(() => {})
    }
  }, [outlineId])

  React.useEffect(() => {
    if (
      !presentation ||
      autoGenerationStarted.current ||
      (presentation.outline?.slides?.length ?? 0) > 0
    ) {
      return
    }

    if (
      presentation.status !== 'draft' &&
      presentation.status !== 'outline_generating'
    ) {
      return
    }

    autoGenerationStarted.current = true

    fetch(`/api/presentations/${presentation.id}/generate-outline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    })
      .then(response =>
        consumeSseResponse(response, {
          onComplete: handleOutlineUpdated
        })
      )
      .catch(error => {
        console.error('Error auto-generating outline:', error)
      })
  }, [consumeSseResponse, handleOutlineUpdated, presentation])

  const handleGenerateSlides = async () => {
    if (!presentation || isGeneratingSlides) return

    setIsGeneratingSlides(true)

    try {
      const response = await fetch(
        `/api/presentations/${presentation.id}/generate-slides`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }
      )

      await consumeSseResponse(response, {
        onDeckComplete: () =>
          router.push(`/presentations/${presentation.id}/editor`)
      })
    } catch (error) {
      console.error('Error generating slides:', error)
    } finally {
      setIsGeneratingSlides(false)
    }
  }

  const handleRegenerateOutline = async () => {
    if (!presentation || isGeneratingSlides) return

    setIsGeneratingSlides(true)

    try {
      const response = await fetch(
        `/api/presentations/${presentation.id}/generate-outline`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }
      )

      await consumeSseResponse(response, {
        onComplete: handleOutlineUpdated
      })
    } catch (error) {
      console.error('Error regenerating outline:', error)
    } finally {
      setIsGeneratingSlides(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2Icon className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!presentation) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-semibold">Presentation not found</h1>
          {loadError ? (
            <p className="text-sm text-muted-foreground">{loadError}</p>
          ) : null}
          <Button asChild>
            <Link href="/presentations">Back to Presentations</Link>
          </Button>
        </div>
      </div>
    )
  }

  const outline = presentation?.outline
  const slides = outline?.slides ?? []

  const isGenerating =
    presentation.status === 'outline_generating' ||
    presentation.status === 'slides_generating' ||
    ((presentation.outline?.slides?.length ?? 0) === 0 &&
      presentation.status === 'draft')

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between gap-4">
          {/* Left: Back + Title */}
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/presentations">
                <ArrowLeftIcon className="w-4 h-4 mr-1" />
                Presentations
              </Link>
            </Button>
            <span className="text-muted-foreground">/</span>
            <h1 className="text-sm font-medium truncate max-w-[300px]">
              {presentation.title}
            </h1>
          </div>

          {/* Right: Settings */}
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/presentations/${presentation.id}/settings`}>
              <SettingsIcon className="w-4 h-4" />
            </Link>
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="container py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Section Header */}
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              Outline Editor
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Edit your presentation outline. Changes are saved automatically.
            </p>
          </div>

          {/* Generation Progress */}
          {isGenerating && (
            <GenerationProgress
              presentationId={presentation.id}
              onComplete={handleOutlineUpdated}
            />
          )}

          {/* Outline Editor */}
          {!isGenerating && (
            <OutlineEditor
              initialOutline={slides}
              presentationId={presentation.id}
              onOutlineChange={handleOutlineChange}
            />
          )}

          {/* Divider */}
          <div className="border-t" />

          {/* Chat Bar */}
          <div>
            <h3 className="text-sm font-medium mb-3">Edit with AI</h3>
            <OutlineChatBar
              presentationId={presentation.id}
              onOutlineUpdated={handleOutlineUpdated}
            />
          </div>
        </div>
      </main>

      {/* Bottom Bar */}
      <footer className="fixed bottom-0 left-0 right-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between gap-4">
          <div className="flex-1" />

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={handleRegenerateOutline}
              disabled={isGeneratingSlides}
            >
              {isGeneratingSlides ? (
                <Loader2Icon className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Regenerate Outline
            </Button>

            <Button
              onClick={handleGenerateSlides}
              disabled={isGeneratingSlides || slides.length === 0}
            >
              {isGeneratingSlides ? (
                <Loader2Icon className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Generate Slides
              <svg
                className="w-4 h-4 ml-2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 7l5 5m0 0l-5 5m5-5H6"
                />
              </svg>
            </Button>
          </div>
        </div>
      </footer>

      {/* Spacer for fixed footer */}
      <div className="h-16" />
    </div>
  )
}
