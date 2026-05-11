'use client'

import React, { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

import { themes } from '@/lib/presentations/themes'

import { Spinner } from '@/components/ui/spinner'

import { SlideEditor } from '@/components/presentations/editor/slide-editor'

import type {
  LayoutType,
  SlideElement
} from '@/states/presentation-editor-store'
import { usePresentationEditorStore } from '@/states/presentation-editor-store'

const VALID_LAYOUTS = new Set<LayoutType>([
  'title',
  'section',
  'two_column',
  'image_left',
  'chart',
  'quote',
  'text'
])

function normalizeLayoutType(value: unknown, index: number): LayoutType {
  if (typeof value === 'string' && VALID_LAYOUTS.has(value as LayoutType)) {
    return value as LayoutType
  }

  return index === 0 ? 'title' : 'text'
}

function buildElementsFromContent({
  slideId,
  title,
  subtitle,
  bullets,
  layoutType
}: {
  slideId: string
  title: string
  subtitle?: string
  bullets: string[]
  layoutType: LayoutType
}): SlideElement[] {
  const centered = layoutType === 'title' || layoutType === 'section'
  const elements: SlideElement[] = [
    {
      id: `${slideId}-heading`,
      type: 'heading',
      content: title,
      fontFamily: 'Inter',
      fontSize: layoutType === 'title' ? 54 : 38,
      fontWeight: 'bold',
      color: '#1A1A1A',
      align: centered ? 'center' : 'left',
      lineHeight: 1.1
    }
  ]

  if (subtitle) {
    elements.push({
      id: `${slideId}-subtitle`,
      type: 'body',
      content: subtitle,
      fontFamily: 'Inter',
      fontSize: 24,
      color: '#4B5563',
      align: centered ? 'center' : 'left',
      lineHeight: 1.35
    })
  }

  bullets.forEach((bullet, bulletIndex) => {
    elements.push({
      id: `${slideId}-bullet-${bulletIndex}`,
      type: 'bullet',
      content: bullet,
      fontFamily: 'Inter',
      fontSize: 20,
      color: '#1A1A1A',
      align: 'left',
      lineHeight: 1.45
    })
  })

  return elements
}

function normalizeSlides(slides: any[] | undefined) {
  return (slides ?? []).map((slide, index) => {
    const content = slide.contentJson ?? {}
    const slideId = slide.id ?? `slide-${index + 1}`
    const title = slide.title ?? `Slide ${index + 1}`
    const subtitle =
      typeof content.subtitle === 'string' ? content.subtitle : undefined
    const layoutType = normalizeLayoutType(
      slide.layoutType ?? slide.layout_type,
      index
    )
    const bullets = Array.isArray(content.bullets)
      ? content.bullets.map((bullet: unknown) => String(bullet))
      : []
    const elements =
      Array.isArray(content.elements) && content.elements.length > 0
        ? content.elements
        : buildElementsFromContent({
            slideId,
            title,
            subtitle,
            bullets,
            layoutType
          })

    return {
      id: slideId,
      title,
      subtitle,
      layoutType,
      bullets,
      background:
        typeof content.background === 'string' ? content.background : undefined,
      imageUrl:
        typeof content.imageUrl === 'string' ? content.imageUrl : undefined,
      imagePrompt:
        typeof content.imagePrompt === 'string'
          ? content.imagePrompt
          : undefined,
      chartData:
        content.chartData && typeof content.chartData === 'object'
          ? content.chartData
          : undefined,
      quoteText:
        typeof content.quoteText === 'string' ? content.quoteText : undefined,
      quoteAttribution:
        typeof content.quoteAttribution === 'string'
          ? content.quoteAttribution
          : undefined,
      speakerNotes:
        typeof slide.speakerNotes === 'string' ? slide.speakerNotes : undefined,
      elements
    }
  })
}

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
        const response = await fetch(`/api/presentations/${id}`)

        if (!response.ok) {
          const data = await response.json().catch(() => null)
          throw new Error(data?.error || 'Failed to load presentation')
        }

        const data = await response.json()
        loadPresentation({
          id: data.id,
          title: data.title,
          slides: normalizeSlides(data.slides),
          theme: themes.find(t => t.id === data.themeId) || themes[0]
        })
      } catch (error) {
        setError(
          error instanceof Error ? error.message : 'Failed to load presentation'
        )
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
