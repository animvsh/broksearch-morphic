'use client'

import React, { useCallback, useState } from 'react'

import { cn } from '@/lib/utils'

import { usePresentationEditorStore, selectActiveSlide } from '@/states/presentation-editor-store'
import type { LayoutType, SlideElement } from '@/states/presentation-editor-store'

// ---------------------------------------------------------------------------
// Layout renderers
// ---------------------------------------------------------------------------

interface LayoutRendererProps {
  slide: ReturnType<typeof selectActiveSlide>
  selectedElementId: string | null
  onSelectElement: (id: string | null) => void
  onUpdateElement: (id: string, updates: Partial<SlideElement>) => void
}

function TitleLayout({ slide, selectedElementId, onSelectElement, onUpdateElement }: LayoutRendererProps) {
  if (!slide) return null

  const headingEl = slide.elements?.find((el) => el.type === 'heading')

  return (
    <div className="h-full flex flex-col items-center justify-center px-16 py-12">
      <EditableText
        element={headingEl}
        isSelected={selectedElementId === headingEl?.id}
        onSelect={() => onSelectElement(headingEl?.id ?? null)}
        onUpdate={(updates) => headingEl && onUpdateElement(headingEl.id, updates)}
        className="text-6xl font-bold text-center leading-tight"
        style={{ color: slide.background ? '#1A1A1A' : 'var(--foreground)' }}
      />
      {slide.subtitle && (
        <p className="mt-6 text-2xl text-muted-foreground text-center">
          {slide.subtitle}
        </p>
      )}
    </div>
  )
}

function SectionLayout({ slide, selectedElementId, onSelectElement, onUpdateElement }: LayoutRendererProps) {
  if (!slide) return null

  const headingEl = slide.elements?.find((el) => el.type === 'heading')

  return (
    <div className="h-full flex flex-col px-16 py-12">
      {/* Accent bar */}
      <div
        className="w-16 h-2 rounded-full mb-8"
        style={{ backgroundColor: 'var(--accent)' }}
      />
      <EditableText
        element={headingEl}
        isSelected={selectedElementId === headingEl?.id}
        onSelect={() => onSelectElement(headingEl?.id ?? null)}
        onUpdate={(updates) => headingEl && onUpdateElement(headingEl.id, updates)}
        className="text-5xl font-bold leading-tight"
        style={{ color: slide.background ? '#1A1A1A' : 'var(--foreground)' }}
      />
      {slide.bullets && slide.bullets.length > 0 && (
        <ul className="mt-8 space-y-4">
          {slide.bullets.map((bullet, i) => {
            const bulletEl = slide.elements?.find(
              (el) => el.type === 'bullet' && el.content === bullet
            )
            return (
              <li key={i} className="flex items-start gap-3">
                <span
                  className="mt-3 w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: 'var(--accent)' }}
                />
                <EditableText
                  element={bulletEl}
                  isSelected={selectedElementId === bulletEl?.id}
                  onSelect={() => onSelectElement(bulletEl?.id ?? null)}
                  onUpdate={(updates) => bulletEl && onUpdateElement(bulletEl.id, updates)}
                  className="text-xl leading-relaxed"
                />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function TwoColumnLayout({ slide, selectedElementId, onSelectElement, onUpdateElement }: LayoutRendererProps) {
  if (!slide) return null

  const leftBullets = slide.bullets?.slice(0, Math.ceil((slide.bullets?.length ?? 0) / 2)) ?? []
  const rightBullets = slide.bullets?.slice(Math.ceil((slide.bullets?.length ?? 0) / 2)) ?? []

  return (
    <div className="h-full grid grid-cols-2 gap-12 px-16 py-12">
      {/* Left column */}
      <div className="flex flex-col justify-center">
        {leftBullets.map((bullet, i) => {
          const bulletEl = slide.elements?.find(
            (el) => el.type === 'bullet' && el.content === bullet
          )
          return (
            <div key={i} className="flex items-start gap-3 mb-4">
              <span
                className="mt-2 w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: 'var(--accent)' }}
              />
              <EditableText
                element={bulletEl}
                isSelected={selectedElementId === bulletEl?.id}
                onSelect={() => onSelectElement(bulletEl?.id ?? null)}
                onUpdate={(updates) => bulletEl && onUpdateElement(bulletEl.id, updates)}
                className="text-lg leading-relaxed"
              />
            </div>
          )
        })}
      </div>

      {/* Right column */}
      <div className="flex flex-col justify-center">
        {rightBullets.map((bullet, i) => {
          const bulletEl = slide.elements?.find(
            (el) => el.type === 'bullet' && el.content === bullet
          )
          return (
            <div key={i} className="flex items-start gap-3 mb-4">
              <span
                className="mt-2 w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: 'var(--accent)' }}
              />
              <EditableText
                element={bulletEl}
                isSelected={selectedElementId === bulletEl?.id}
                onSelect={() => onSelectElement(bulletEl?.id ?? null)}
                onUpdate={(updates) => bulletEl && onUpdateElement(bulletEl.id, updates)}
                className="text-lg leading-relaxed"
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ImageLeftLayout({ slide, selectedElementId, onSelectElement, onUpdateElement }: LayoutRendererProps) {
  if (!slide) return null

  const headingEl = slide.elements?.find((el) => el.type === 'heading')

  return (
    <div className="h-full grid grid-cols-2 gap-12 px-16 py-12">
      {/* Image */}
      <div className="flex items-center justify-center bg-muted rounded-lg overflow-hidden">
        {slide.imageUrl ? (
          <img
            src={slide.imageUrl}
            alt={slide.imagePrompt ?? 'Slide image'}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="text-center text-muted-foreground p-8">
            <svg
              className="mx-auto h-12 w-12 mb-3 opacity-50"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
              />
            </svg>
            <p className="text-sm">Add an image</p>
          </div>
        )}
      </div>

      {/* Text content */}
      <div className="flex flex-col justify-center">
        <EditableText
          element={headingEl}
          isSelected={selectedElementId === headingEl?.id}
          onSelect={() => onSelectElement(headingEl?.id ?? null)}
          onUpdate={(updates) => headingEl && onUpdateElement(headingEl.id, updates)}
          className="text-4xl font-bold leading-tight mb-4"
          style={{ color: slide.background ? '#1A1A1A' : 'var(--foreground)' }}
        />
        {slide.bullets && slide.bullets.length > 0 && (
          <ul className="space-y-3">
            {slide.bullets.map((bullet, i) => {
              const bulletEl = slide.elements?.find(
                (el) => el.type === 'bullet' && el.content === bullet
              )
              return (
                <li key={i} className="flex items-start gap-3">
                  <span
                    className="mt-2 w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: 'var(--accent)' }}
                  />
                  <EditableText
                    element={bulletEl}
                    isSelected={selectedElementId === bulletEl?.id}
                    onSelect={() => onSelectElement(bulletEl?.id ?? null)}
                    onUpdate={(updates) => bulletEl && onUpdateElement(bulletEl.id, updates)}
                    className="text-lg leading-relaxed"
                  />
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function ChartLayout({ slide, selectedElementId, onSelectElement, onUpdateElement }: LayoutRendererProps) {
  if (!slide) return null

  const headingEl = slide.elements?.find((el) => el.type === 'heading')

  return (
    <div className="h-full flex flex-col items-center justify-center px-16 py-12">
      <EditableText
        element={headingEl}
        isSelected={selectedElementId === headingEl?.id}
        onSelect={() => onSelectElement(headingEl?.id ?? null)}
        onUpdate={(updates) => headingEl && onUpdateElement(headingEl.id, updates)}
        className="text-4xl font-bold text-center mb-8"
        style={{ color: slide.background ? '#1A1A1A' : 'var(--foreground)' }}
      />
      {/* Chart placeholder */}
      <div
        className="w-full max-w-2xl aspect-video bg-muted rounded-lg flex items-center justify-center"
      >
        {slide.chartData ? (
          <div className="text-center text-muted-foreground">
            <svg
              className="mx-auto h-16 w-16 mb-3 opacity-50"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
              />
            </svg>
            <p>Chart visualization</p>
          </div>
        ) : (
          <div className="text-center text-muted-foreground">
            <svg
              className="mx-auto h-16 w-16 mb-3 opacity-50"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
              />
            </svg>
            <p>Add chart data</p>
          </div>
        )}
      </div>
    </div>
  )
}

function QuoteLayout({ slide, selectedElementId, onSelectElement, onUpdateElement }: LayoutRendererProps) {
  if (!slide) return null

  const quoteEl = slide.elements?.find((el) => el.type === 'quote')

  return (
    <div className="h-full flex flex-col items-center justify-center px-16 py-12">
      {/* Quote mark */}
      <svg
        className="w-16 h-16 text-accent opacity-50 mb-6"
        fill="currentColor"
        viewBox="0 0 24 24"
      >
        <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
      </svg>

      <EditableText
        element={quoteEl}
        isSelected={selectedElementId === quoteEl?.id}
        onSelect={() => onSelectElement(quoteEl?.id ?? null)}
        onUpdate={(updates) => quoteEl && onUpdateElement(quoteEl.id, updates)}
        className="text-3xl font-serif italic text-center leading-relaxed max-w-3xl"
        style={{ color: slide.background ? '#1A1A1A' : 'var(--foreground)' }}
      />

      {slide.quoteAttribution && (
        <p className="mt-6 text-xl text-muted-foreground">
          — {slide.quoteAttribution}
        </p>
      )}
    </div>
  )
}

function TextLayout({ slide, selectedElementId, onSelectElement, onUpdateElement }: LayoutRendererProps) {
  if (!slide) return null

  const bodyEl = slide.elements?.find((el) => el.type === 'body')

  return (
    <div className="h-full flex flex-col items-center justify-center px-16 py-12">
      <EditableText
        element={bodyEl}
        isSelected={selectedElementId === bodyEl?.id}
        onSelect={() => onSelectElement(bodyEl?.id ?? null)}
        onUpdate={(updates) => bodyEl && onUpdateElement(bodyEl.id, updates)}
        className="text-xl leading-relaxed text-center max-w-3xl"
        style={{ color: slide.background ? '#1A1A1A' : 'var(--foreground)' }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Editable text component
// ---------------------------------------------------------------------------

interface EditableTextProps {
  element?: SlideElement
  isSelected: boolean
  onSelect: () => void
  onUpdate: (updates: Partial<SlideElement>) => void
  className?: string
  style?: React.CSSProperties
}

function EditableText({
  element,
  isSelected,
  onSelect,
  onUpdate,
  className,
  style,
}: EditableTextProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(element?.content ?? '')

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setIsEditing(true)
    setEditValue(element?.content ?? '')
  }, [element?.content])

  const handleBlur = useCallback(() => {
    setIsEditing(false)
    if (editValue !== element?.content) {
      onUpdate({ content: editValue })
    }
  }, [editValue, element?.content, onUpdate])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleBlur()
      }
      if (e.key === 'Escape') {
        setIsEditing(false)
        setEditValue(element?.content ?? '')
      }
    },
    [handleBlur, element?.content]
  )

  if (!element) {
    return (
      <div
        className={cn(
          'px-2 py-1 rounded cursor-text min-h-[2rem]',
          'text-muted-foreground italic'
        )}
      >
        Click to add text
      </div>
    )
  }

  if (isEditing) {
    return (
      <input
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        autoFocus
        className={cn(
          'px-2 py-1 rounded border-2 border-accent bg-background outline-none min-w-[100px]',
          className
        )}
        style={style}
      />
    )
  }

  return (
    <div
      className={cn(
        'px-2 py-1 rounded cursor-text transition-all',
        isSelected && 'ring-2 ring-accent ring-offset-2 bg-accent/10',
        !isSelected && 'hover:bg-muted/50'
      )}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
      onDoubleClick={handleDoubleClick}
      style={style}
    >
      {element.content || <span className="text-muted-foreground italic">Click to edit</span>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Layout renderer map
// ---------------------------------------------------------------------------

const LAYOUT_RENDERERS: Record<LayoutType, React.ComponentType<LayoutRendererProps>> = {
  title: TitleLayout,
  section: SectionLayout,
  two_column: TwoColumnLayout,
  image_left: ImageLeftLayout,
  chart: ChartLayout,
  quote: QuoteLayout,
  text: TextLayout,
}

// ---------------------------------------------------------------------------
// Main SlideCanvas component
// ---------------------------------------------------------------------------

export function SlideCanvas() {
  const {
    slides,
    activeSlideIndex,
    selectedElementId,
    selectElement,
    updateElement,
  } = usePresentationEditorStore()

  const slide = slides[activeSlideIndex]

  const handleSelectElement = useCallback(
    (id: string | null) => {
      selectElement(id)
    },
    [selectElement]
  )

  const handleUpdateElement = useCallback(
    (id: string, updates: Partial<SlideElement>) => {
      updateElement(id, updates)
    },
    [updateElement]
  )

  if (!slide) {
    return (
      <div className="h-full flex items-center justify-center bg-muted/30">
        <p className="text-muted-foreground">No slide selected</p>
      </div>
    )
  }

  const LayoutRenderer = LAYOUT_RENDERERS[slide.layoutType] ?? TitleLayout

  return (
    <div className="h-full flex flex-col bg-muted/30">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-background border-b border-border">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-muted-foreground">
            {slide.layoutType.replace('_', ' ')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {selectedElementId ? 'Element selected' : 'Click to select'}
          </span>
        </div>
      </div>

      {/* Slide canvas */}
      <div
        className="flex-1 overflow-auto p-8"
        onClick={() => selectElement(null)}
      >
        <div
          className={cn(
            'mx-auto w-full max-w-5xl aspect-video rounded-lg shadow-xl overflow-hidden',
            'bg-white dark:bg-zinc-900'
          )}
          style={
            slide.background
              ? { backgroundColor: slide.background }
              : { backgroundColor: 'var(--slide-bg, #FAFAFA)' }
          }
        >
          <LayoutRenderer
            slide={slide}
            selectedElementId={selectedElementId}
            onSelectElement={handleSelectElement}
            onUpdateElement={handleUpdateElement}
          />
        </div>
      </div>
    </div>
  )
}
