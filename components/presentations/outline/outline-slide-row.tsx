'use client'

import React, { useState } from 'react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { ChevronUpIcon, ChevronDownIcon, TrashIcon, GripVerticalIcon } from 'lucide-react'

import type { OutlineSlide, LayoutType } from './types'
import { LAYOUT_OPTIONS, LAYOUT_LABELS } from './types'

interface OutlineSlideRowProps {
  slide: OutlineSlide
  index: number
  totalSlides: number
  onTitleChange: (title: string) => void
  onLayoutChange: (layout: LayoutType) => void
  onBulletChange: (bulletIndex: number, text: string) => void
  onAddBullet: () => void
  onDeleteBullet: (bulletIndex: number) => void
  onDeleteSlide: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}

export function OutlineSlideRow({
  slide,
  index,
  totalSlides,
  onTitleChange,
  onLayoutChange,
  onBulletChange,
  onAddBullet,
  onDeleteBullet,
  onDeleteSlide,
  onMoveUp,
  onMoveDown
}: OutlineSlideRowProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const handleDeleteClick = () => {
    if (totalSlides === 1) {
      return
    }
    if (showDeleteConfirm) {
      onDeleteSlide()
      setShowDeleteConfirm(false)
    } else {
      setShowDeleteConfirm(true)
      setTimeout(() => setShowDeleteConfirm(false), 3000)
    }
  }

  return (
    <div className="group relative rounded-lg border border-border bg-card p-4 transition-all hover:shadow-sm">
      {/* Slide Header */}
      <div className="flex items-start gap-3">
        {/* Drag Handle */}
        <div className="flex flex-col gap-1 pt-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={index === 0}
            className="p-0.5 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Move slide up"
          >
            <ChevronUpIcon className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={index === totalSlides - 1}
            className="p-0.5 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Move slide down"
          >
            <ChevronDownIcon className="w-3 h-3" />
          </button>
        </div>

        {/* Slide Number Badge */}
        <div className="flex-shrink-0">
          <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">
            {index + 1}
          </div>
        </div>

        {/* Title and Layout */}
        <div className="flex-1 min-w-0 space-y-3">
          {/* Title Input */}
          <Input
            value={slide.title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder={`Slide ${index + 1} title`}
            className="text-base font-medium border-transparent hover:border-border focus-visible:border-primary px-2 py-1 h-auto"
          />

          {/* Layout Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Layout:</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                >
                  <span>{LAYOUT_LABELS[slide.layout_type]}</span>
                  <svg
                    className="w-3 h-3 ml-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {LAYOUT_OPTIONS.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    onClick={() => onLayoutChange(option.value)}
                    className={cn(
                      'text-xs',
                      slide.layout_type === option.value &&
                        'bg-accent font-medium'
                    )}
                  >
                    {option.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Bullets */}
          <div className="space-y-2 pl-2">
            {slide.bullets.map((bullet, bulletIndex) => (
              <div
                key={bulletIndex}
                className="flex items-center gap-2 group/bullet"
              >
                <span className="text-muted-foreground text-xs">•</span>
                <Input
                  value={bullet}
                  onChange={(e) =>
                    onBulletChange(bulletIndex, e.target.value)
                  }
                  placeholder="Add a bullet point..."
                  className="flex-1 h-8 text-sm border-transparent hover:border-border focus-visible:border-primary px-2 py-1"
                />
                <button
                  type="button"
                  onClick={() => onDeleteBullet(bulletIndex)}
                  className="opacity-0 group-hover/bullet:opacity-100 p-1 rounded hover:bg-destructive/10 transition-opacity"
                  aria-label="Delete bullet"
                >
                  <TrashIcon className="w-3 h-3 text-destructive" />
                </button>
              </div>
            ))}

            {/* Add Bullet Button */}
            <button
              type="button"
              onClick={onAddBullet}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors pl-4 opacity-0 group-hover:opacity-100"
            >
              <span className="w-4 h-4 rounded border border-dashed border-current flex items-center justify-center">
                +
              </span>
              Add bullet
            </button>
          </div>
        </div>

        {/* Delete Slide Button */}
        <button
          type="button"
          onClick={handleDeleteClick}
          disabled={totalSlides === 1}
          className={cn(
            'flex-shrink-0 p-2 rounded transition-all opacity-0 group-hover:opacity-100',
            totalSlides === 1
              ? 'opacity-0 cursor-not-allowed'
              : showDeleteConfirm
                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                : 'hover:bg-destructive/10 text-destructive'
          )}
          aria-label={showDeleteConfirm ? 'Confirm delete' : 'Delete slide'}
        >
          <TrashIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
