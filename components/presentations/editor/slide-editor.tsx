'use client'

import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

import { ArrowLeft, Download, Loader2, Play, Share2 } from 'lucide-react'
import { toast } from 'sonner'

import { type Theme, themes } from '@/lib/presentations/themes'
import { cn } from '@/lib/utils'
import { safeCopyTextToClipboard } from '@/lib/utils/copy-to-clipboard'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import {
  type ThemeId,
  ThemePicker
} from '@/components/presentations/theme/theme-picker'

import { AIEditBar } from './ai-edit-bar'
import { SlideCanvas } from './slide-canvas'
import { SlideInspector } from './slide-inspector'
import { SlideThumbnailList } from './slide-thumbnail-list'

import { usePresentationEditorStore } from '@/states/presentation-editor-store'

// ---------------------------------------------------------------------------
// Export formats
// ---------------------------------------------------------------------------

type ExportFormat = 'pptx'

// ---------------------------------------------------------------------------
// Main SlideEditor component
// ---------------------------------------------------------------------------

export function SlideEditor() {
  const {
    presentationId,
    title,
    setTitle,
    theme,
    setTheme,
    slides,
    isSaving,
    setIsSaving,
    loadPresentation
  } = usePresentationEditorStore()

  const [showThemePicker, setShowThemePicker] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [localTitle, setLocalTitle] = useState(title)

  // Auto-save effect
  useEffect(() => {
    if (!presentationId) return

    const saveTimeout = setTimeout(async () => {
      setIsSaving(true)
      try {
        await fetch(`/api/presentations/${presentationId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, slides, themeId: theme.id })
        })
      } catch (error) {
        console.error('Error saving presentation:', error)
      } finally {
        setIsSaving(false)
      }
    }, 2000) // Debounce saves by 2 seconds

    return () => clearTimeout(saveTimeout)
  }, [presentationId, title, slides, theme.id, setIsSaving])

  const handleThemeSelect = useCallback(
    (themeId: ThemeId | 'auto') => {
      const selectedTheme = themes.find(t => t.id === themeId)
      if (selectedTheme) {
        setTheme(selectedTheme)
      }
      setShowThemePicker(false)
    },
    [setTheme]
  )

  const handleTitleBlur = useCallback(() => {
    setEditingTitle(false)
    if (localTitle.trim() && localTitle !== title) {
      setTitle(localTitle.trim())
    } else {
      setLocalTitle(title)
    }
  }, [localTitle, title, setTitle])

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        handleTitleBlur()
      }
      if (e.key === 'Escape') {
        setLocalTitle(title)
        setEditingTitle(false)
      }
    },
    [handleTitleBlur, title]
  )

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      if (!presentationId) return

      try {
        const response = await fetch(
          `/api/presentations/${presentationId}/export`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ format })
          }
        )

        if (!response.ok) throw new Error('Export failed')

        const blob = await response.blob()
        const downloadUrl = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = downloadUrl
        link.download = `${title || 'presentation'}.${format}`
        document.body.appendChild(link)
        link.click()
        link.remove()
        window.URL.revokeObjectURL(downloadUrl)
        toast.success('PowerPoint export downloaded.')
      } catch (error) {
        console.error('Export error:', error)
        toast.error('Could not export this presentation.')
      }
    },
    [presentationId, title]
  )

  const handleShare = useCallback(async () => {
    if (!presentationId) return

    try {
      const response = await fetch(
        `/api/presentations/${presentationId}/share`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ is_public: true })
        }
      )

      if (!response.ok) throw new Error('Share failed')

      const data = await response.json()

      if (data.share_url) {
        const copied = await safeCopyTextToClipboard(data.share_url)
        toast.success(
          copied ? 'Share link copied.' : 'Share link created for this deck.'
        )
      }
    } catch (error) {
      console.error('Share error:', error)
      toast.error('Could not create a share link.')
    }
  }, [presentationId])

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-border bg-background">
        {/* Left section */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/presentations">
              <ArrowLeft className="size-4" />
              <span className="sr-only">Back to presentations</span>
            </Link>
          </Button>

          {/* Title */}
          <div className="flex items-center gap-2">
            {editingTitle ? (
              <Input
                value={localTitle}
                onChange={e => setLocalTitle(e.target.value)}
                onBlur={handleTitleBlur}
                onKeyDown={handleTitleKeyDown}
                autoFocus
                className="h-8 w-64 font-semibold"
              />
            ) : (
              <button
                onClick={() => {
                  setLocalTitle(title)
                  setEditingTitle(true)
                }}
                className="text-sm font-semibold text-foreground hover:text-accent transition-colors px-2 py-1 rounded hover:bg-muted"
              >
                {title}
              </button>
            )}

            {/* Saving indicator */}
            {isSaving && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                Saving...
              </span>
            )}
          </div>
        </div>

        {/* Center section - Theme picker */}
        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowThemePicker(!showThemePicker)}
            className="gap-2"
          >
            <div
              className="w-4 h-4 rounded-full border"
              style={{ backgroundColor: theme.colors.accent }}
            />
            {theme.name}
          </Button>

          {showThemePicker && (
            <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 z-50">
              <div className="bg-popover border rounded-lg shadow-lg p-4 w-96">
                <ThemePicker
                  selectedThemeId={theme.id as ThemeId}
                  onSelect={handleThemeSelect}
                />
              </div>
              <div
                className="fixed inset-0 -z-10"
                onClick={() => setShowThemePicker(false)}
              />
            </div>
          )}
        </div>

        {/* Right section */}
        <div className="flex items-center gap-2">
          {/* Present button */}
          <Button variant="default" size="sm" className="gap-2" asChild>
            <Link href={`/presentations/${presentationId}/present`}>
              <Play className="size-4" />
              Present
            </Link>
          </Button>

          {/* Share button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleShare}
            className="gap-2"
          >
            <Share2 className="size-4" />
            Share
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport('pptx')}
            className="gap-2"
          >
            <Download className="size-4" />
            Export PPTX
          </Button>
        </div>
      </header>

      {/* Main content - 3 panel layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel - Slide thumbnails */}
        <div className="w-64 flex-shrink-0">
          <SlideThumbnailList />
        </div>

        {/* Center panel - Slide canvas */}
        <div className="flex-1 min-w-0">
          <SlideCanvas />
        </div>

        {/* Right panel - Inspector */}
        <div className="w-80 flex-shrink-0">
          <SlideInspector />
        </div>
      </div>

      {/* Bottom bar - AI edit */}
      <div className="h-14 flex-shrink-0">
        <AIEditBar />
      </div>
    </div>
  )
}
