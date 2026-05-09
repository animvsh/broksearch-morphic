'use client'

import React, { useCallback, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { ArrowLeftIcon, Loader2Icon, SettingsIcon } from 'lucide-react'

import type { Presentation, PresentationStatus } from '@/lib/presentations/types'
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

// Mock data for development
function getMockPresentation(id: string): PresentationWithOutline {
  return {
    id,
    userId: 'mock-user-id',
    title: 'Investor Pitch Deck',
    description: 'A compelling pitch for our startup',
    status: 'draft',
    slideCount: 0,
    language: 'en',
    style: 'startup',
    isPublic: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    outline: {
      slides: [
        {
          title: 'The Problem',
          layout_type: 'title' as const,
          bullets: [
            'Traditional fundraising takes 6+ months',
            'Investors are overwhelmed with bad pitches',
            'Founders lack tools to tell their story'
          ]
        },
        {
          title: 'Our Solution',
          layout_type: 'section' as const,
          bullets: [
            'AI-powered presentation builder',
            'Focus on storytelling, not design',
            'Built by founders, for founders'
          ]
        },
        {
          title: 'Market Opportunity',
          layout_type: 'two_column' as const,
          bullets: [
            '$2B+ market for presentation tools',
            '300K new startups per year in US alone',
            'Growing demand for AI-assisted creation'
          ]
        }
      ]
    }
  }
}

interface PresentationsOutlinePageProps {
  params: Promise<{ id: string }>
}

export default function PresentationsOutlinePage({
  params
}: PresentationsOutlinePageProps) {
  const router = useRouter()
  const [presentation, setPresentation] = useState<PresentationWithOutline | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isGeneratingSlides, setIsGeneratingSlides] = useState(false)
  const [outlineId, setOutlineId] = useState<string | null>(null)

  // Load presentation on mount
  React.useEffect(() => {
    const loadPresentation = async () => {
      try {
        const resolvedParams = await params
        setOutlineId(resolvedParams.id)

        // Try to fetch from API first
        try {
          const response = await fetch(`/api/presentations/${resolvedParams.id}`)
          if (response.ok) {
            const data = await response.json()
            setPresentation(data)
          } else {
            // Use mock data for development
            setPresentation(getMockPresentation(resolvedParams.id))
          }
        } catch {
          // Use mock data for development
          setPresentation(getMockPresentation(resolvedParams.id))
        }
      } catch (error) {
        console.error('Error loading presentation:', error)
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
        .then((res) => res.ok && res.json())
        .then((data) => {
          if (data) setPresentation(data)
        })
        .catch(() => {})
    }
  }, [outlineId])

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

      if (response.ok) {
        // Redirect to editor on success
        router.push(`/presentations/${presentation.id}/editor`)
      } else {
        const data = await response.json()
        console.error('Failed to generate slides:', data.error)
      }
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

      if (!response.ok) {
        const data = await response.json()
        console.error('Failed to regenerate outline:', data.error)
      }
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
    presentation.status === 'slides_generating'

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
