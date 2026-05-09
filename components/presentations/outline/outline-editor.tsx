'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'

import { PlusIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

import { Button } from '@/components/ui/button'

import { OutlineSlideRow } from './outline-slide-row'
import type { LayoutType,OutlineSlide } from './types'

interface OutlineEditorProps {
  initialOutline: OutlineSlide[]
  presentationId: string
  onOutlineChange?: (outline: OutlineSlide[]) => void
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function debounce<T extends (...args: any[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn(...args), delay)
  }
}

export function OutlineEditor({
  initialOutline,
  presentationId,
  onOutlineChange
}: OutlineEditorProps) {
  const [slides, setSlides] = useState<OutlineSlide[]>(initialOutline)
  const [isSaving, setIsSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)

  const outlineRef = useRef(initialOutline)
  outlineRef.current = slides

  // Auto-save on blur with debounce
  const saveOutline = useCallback(
    async (outline: OutlineSlide[]) => {
      setIsSaving(true)
      try {
        const response = await fetch(
          `/api/presentations/${presentationId}/outline`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ outline: outline })
          }
        )

        if (!response.ok) {
          throw new Error('Failed to save outline')
        }

        setLastSaved(new Date())
      } catch (error) {
        console.error('Error saving outline:', error)
      } finally {
        setIsSaving(false)
      }
    },
    [presentationId]
  )

  const debouncedSave = useRef(
    debounce((outline: OutlineSlide[]) => {
      saveOutline(outline)
    }, 1000)
  ).current

  // Notify parent of changes
  useEffect(() => {
    onOutlineChange?.(slides)
  }, [slides, onOutlineChange])

  // Title change
  const handleTitleChange = (slideIndex: number, title: string) => {
    setSlides((prev) => {
      const updated = [...prev]
      updated[slideIndex] = { ...updated[slideIndex], title }
      debouncedSave(updated)
      return updated
    })
  }

  // Layout change
  const handleLayoutChange = (slideIndex: number, layout: LayoutType) => {
    setSlides((prev) => {
      const updated = [...prev]
      updated[slideIndex] = { ...updated[slideIndex], layout_type: layout }
      debouncedSave(updated)
      return updated
    })
  }

  // Bullet change
  const handleBulletChange = (
    slideIndex: number,
    bulletIndex: number,
    text: string
  ) => {
    setSlides((prev) => {
      const updated = [...prev]
      const newBullets = [...updated[slideIndex].bullets]
      newBullets[bulletIndex] = text
      updated[slideIndex] = { ...updated[slideIndex], bullets: newBullets }
      debouncedSave(updated)
      return updated
    })
  }

  // Add bullet
  const handleAddBullet = (slideIndex: number) => {
    setSlides((prev) => {
      const updated = [...prev]
      const newBullets = [...updated[slideIndex].bullets, '']
      updated[slideIndex] = { ...updated[slideIndex], bullets: newBullets }
      debouncedSave(updated)
      return updated
    })
  }

  // Delete bullet
  const handleDeleteBullet = (slideIndex: number, bulletIndex: number) => {
    setSlides((prev) => {
      const updated = [...prev]
      const newBullets = updated[slideIndex].bullets.filter(
        (_, i) => i !== bulletIndex
      )
      updated[slideIndex] = { ...updated[slideIndex], bullets: newBullets }
      debouncedSave(updated)
      return updated
    })
  }

  // Delete slide
  const handleDeleteSlide = (slideIndex: number) => {
    setSlides((prev) => {
      const updated = prev.filter((_, i) => i !== slideIndex)
      debouncedSave(updated)
      return updated
    })
  }

  // Move slide up
  const handleMoveUp = (slideIndex: number) => {
    if (slideIndex === 0) return
    setSlides((prev) => {
      const updated = [...prev]
      ;[updated[slideIndex - 1], updated[slideIndex]] = [
        updated[slideIndex],
        updated[slideIndex - 1]
      ]
      debouncedSave(updated)
      return updated
    })
  }

  // Move slide down
  const handleMoveDown = (slideIndex: number) => {
    setSlides((prev) => {
      if (slideIndex === prev.length - 1) return prev
      const updated = [...prev]
      ;[updated[slideIndex], updated[slideIndex + 1]] = [
        updated[slideIndex + 1],
        updated[slideIndex]
      ]
      debouncedSave(updated)
      return updated
    })
  }

  // Add slide
  const handleAddSlide = () => {
    const newSlide: OutlineSlide = {
      title: '',
      layout_type: 'title',
      bullets: ['']
    }
    setSlides((prev) => {
      const updated = [...prev, newSlide]
      debouncedSave(updated)
      return updated
    })
  }

  return (
    <div className="space-y-4">
      {/* Save status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {isSaving ? (
            <>
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              Saving...
            </>
          ) : lastSaved ? (
            <>
              <span className="w-2 h-2 rounded-full bg-green-500" />
              Saved {lastSaved.toLocaleTimeString()}
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-muted-foreground/30" />
              Auto-save enabled
            </>
          )}
        </div>
      </div>

      {/* Slides */}
      <div className="space-y-3">
        {slides.map((slide, index) => (
          <OutlineSlideRow
            key={index}
            slide={slide}
            index={index}
            totalSlides={slides.length}
            onTitleChange={(title) => handleTitleChange(index, title)}
            onLayoutChange={(layout) => handleLayoutChange(index, layout)}
            onBulletChange={(bulletIndex, text) =>
              handleBulletChange(index, bulletIndex, text)
            }
            onAddBullet={() => handleAddBullet(index)}
            onDeleteBullet={(bulletIndex) =>
              handleDeleteBullet(index, bulletIndex)
            }
            onDeleteSlide={() => handleDeleteSlide(index)}
            onMoveUp={() => handleMoveUp(index)}
            onMoveDown={() => handleMoveDown(index)}
          />
        ))}
      </div>

      {/* Add Slide Button */}
      <Button
        type="button"
        variant="outline"
        onClick={handleAddSlide}
        className="w-full h-12 border-dashed text-muted-foreground hover:text-foreground"
      >
        <PlusIcon className="w-4 h-4 mr-2" />
        Add Slide
      </Button>
    </div>
  )
}
