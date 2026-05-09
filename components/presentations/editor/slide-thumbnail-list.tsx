'use client'

import React, { useCallback } from 'react'
import { Plus, Trash2, Copy, ChevronUp, ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import { usePresentationEditorStore } from '@/states/presentation-editor-store'
import type { SlideContent } from '@/states/presentation-editor-store'

function SlideThumbnail({
  slide,
  index,
  isActive,
  onSelect,
  onDuplicate,
  onDelete,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: {
  slide: SlideContent
  index: number
  isActive: boolean
  onSelect: () => void
  onDuplicate: () => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  canMoveUp: boolean
  canMoveDown: boolean
}) {
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    // Context menu is handled by the DropdownMenu
  }

  return (
    <div
      className={cn(
        'group relative rounded-lg border-2 transition-all cursor-pointer',
        isActive
          ? 'border-accent bg-accent/5 shadow-md'
          : 'border-transparent hover:border-border hover:bg-muted/50'
      )}
      onClick={onSelect}
      onContextMenu={handleContextMenu}
    >
      {/* Thumbnail content */}
      <div
        className={cn(
          'aspect-video rounded-md overflow-hidden p-2',
          'bg-white dark:bg-zinc-900'
        )}
        style={
          slide.background
            ? { backgroundColor: slide.background }
            : undefined
        }
      >
        <div className="h-full flex flex-col">
          {/* Title area */}
          <div
            className="text-xs font-medium truncate px-1"
            style={{
              color: slide.background
                ? '#1A1A1A'
                : 'var(--foreground)',
            }}
          >
            {slide.title || `Slide ${index + 1}`}
          </div>

          {/* Layout type badge */}
          <div className="flex-1 flex items-center justify-center">
            <div className="w-3/4 h-px bg-current opacity-20" />
          </div>

          {/* Subtitle/bullets preview */}
          {slide.bullets && slide.bullets.length > 0 && (
            <div className="space-y-0.5 mt-1">
              {slide.bullets.slice(0, 2).map((bullet, i) => (
                <div
                  key={i}
                  className="h-1 w-full bg-current opacity-10 rounded-sm truncate"
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Slide number */}
      <div
        className={cn(
          'absolute -top-2 -left-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium',
          'bg-muted text-muted-foreground',
          isActive && 'bg-accent text-accent-foreground'
        )}
      >
        {index + 1}
      </div>

      {/* Hover actions */}
      <div
        className={cn(
          'absolute -top-2 -right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity'
        )}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 rounded-full bg-muted hover:bg-accent hover:text-accent-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="sr-only">Open menu</span>
              <svg
                className="h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <circle cx="12" cy="12" r="1" fill="currentColor" />
                <circle cx="12" cy="5" r="1" fill="currentColor" />
                <circle cx="12" cy="19" r="1" fill="currentColor" />
              </svg>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={4}>
            <DropdownMenuItem onSelect={onMoveUp} disabled={!canMoveUp}>
              <ChevronUp className="size-4 mr-2" />
              Move Up
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onMoveDown} disabled={!canMoveDown}>
              <ChevronDown className="size-4 mr-2" />
              Move Down
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onDuplicate}>
              <Copy className="size-4 mr-2" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={onDelete}
              className="text-destructive focus:text-destructive"
              disabled={false}
            >
              <Trash2 className="size-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

export function SlideThumbnailList() {
  const {
    slides,
    activeSlideIndex,
    selectSlide,
    addSlide,
    duplicateSlide,
    deleteSlide,
    reorderSlides,
  } = usePresentationEditorStore()

  const handleAddSlide = useCallback(() => {
    addSlide(activeSlideIndex)
  }, [addSlide, activeSlideIndex])

  const handleDuplicate = useCallback(
    (index: number) => {
      duplicateSlide(index)
    },
    [duplicateSlide]
  )

  const handleDelete = useCallback(
    (index: number) => {
      deleteSlide(index)
    },
    [deleteSlide]
  )

  const handleMoveUp = useCallback(
    (index: number) => {
      reorderSlides(index, index - 1)
    },
    [reorderSlides]
  )

  const handleMoveDown = useCallback(
    (index: number) => {
      reorderSlides(index, index + 1)
    },
    [reorderSlides]
  )

  return (
    <div className="h-full flex flex-col bg-sidebar dark:bg-sidebar border-r border-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-sidebar-foreground">
          Slides
        </h3>
        <span className="text-xs text-muted-foreground">
          {slides.length}
        </span>
      </div>

      {/* Slide list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {slides.map((slide, index) => (
          <SlideThumbnail
            key={slide.id}
            slide={slide}
            index={index}
            isActive={index === activeSlideIndex}
            onSelect={() => selectSlide(index)}
            onDuplicate={() => handleDuplicate(index)}
            onDelete={() => handleDelete(index)}
            onMoveUp={() => handleMoveUp(index)}
            onMoveDown={() => handleMoveDown(index)}
            canMoveUp={index > 0}
            canMoveDown={index < slides.length - 1}
          />
        ))}
      </div>

      {/* Add slide button */}
      <div className="p-3 border-t border-border">
        <Button
          onClick={handleAddSlide}
          variant="outline"
          className="w-full justify-center gap-2"
        >
          <Plus className="size-4" />
          Add Slide
        </Button>
      </div>
    </div>
  )
}
