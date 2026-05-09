'use client'

import React, { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

import { themes } from '@/lib/presentations/themes'

import { Spinner } from '@/components/ui/spinner'

import { SlideEditor } from '@/components/presentations/editor/slide-editor'

import { usePresentationEditorStore } from '@/states/presentation-editor-store'

// ---------------------------------------------------------------------------
// Mock data for development - replace with actual API calls
// ---------------------------------------------------------------------------

const MOCK_SLIDES = [
  {
    id: 'slide-1',
    title: 'Welcome to Brok',
    subtitle: 'The AI-Powered Presentation Builder',
    layoutType: 'title' as const,
    bullets: [],
    background: '#0F172A',
  },
  {
    id: 'slide-2',
    title: 'Key Features',
    layoutType: 'section' as const,
    bullets: [
      'AI-powered slide generation',
      'Real-time collaboration',
      'Beautiful themes',
      'Export to PowerPoint',
    ],
    background: '#0F172A',
  },
  {
    id: 'slide-3',
    title: 'How It Works',
    layoutType: 'two_column' as const,
    bullets: [
      'Create your outline',
      'AI generates slides',
      'Edit and refine',
      'Present or export',
    ],
    background: '#0F172A',
  },
]

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function EditorPage() {
  const params = useParams()
  const id = params.id as string

  const { loadPresentation, presentationId } = usePresentationEditorStore()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadPresentationData() {
      try {
        // For development, use mock data if API fails
        // In production, this would fetch from the API
        const response = await fetch(`/api/presentations/${id}`)

        if (response.ok) {
          const data = await response.json()
          loadPresentation({
            id: data.id,
            title: data.title,
            slides: data.slides || MOCK_SLIDES,
            theme: themes.find((t) => t.id === data.themeId) || themes[0],
          })
        } else {
          // Use mock data for development
          loadPresentation({
            id,
            title: 'Untitled Presentation',
            slides: MOCK_SLIDES,
            theme: themes[0],
          })
        }
      } catch {
        // Use mock data on error
        loadPresentation({
          id,
          title: 'Untitled Presentation',
          slides: MOCK_SLIDES,
          theme: themes[0],
        })
      } finally {
        setIsLoading(false)
      }
    }

    loadPresentationData()
  }, [id, loadPresentation])

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Spinner className="size-8" />
          <p className="text-muted-foreground">Loading presentation...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <p className="text-destructive">Error loading presentation</p>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    )
  }

  return <SlideEditor />
}
