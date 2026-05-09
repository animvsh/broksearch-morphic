'use client'

import React, { useCallback } from 'react'
import { AlignLeft, AlignCenter, AlignRight } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'

import { usePresentationEditorStore, selectActiveSlide, selectSelectedElement } from '@/states/presentation-editor-store'
import type { LayoutType } from '@/states/presentation-editor-store'

// ---------------------------------------------------------------------------
// Font families available
// ---------------------------------------------------------------------------

const FONT_FAMILIES = [
  { value: 'Inter', label: 'Inter' },
  { value: 'Georgia', label: 'Georgia (Serif)' },
  { value: 'Arial', label: 'Arial' },
  { value: 'Helvetica', label: 'Helvetica' },
  { value: 'Times New Roman', label: 'Times New Roman' },
]

const LAYOUT_TYPES: { value: LayoutType; label: string }[] = [
  { value: 'title', label: 'Title' },
  { value: 'section', label: 'Section' },
  { value: 'two_column', label: 'Two Column' },
  { value: 'image_left', label: 'Image Left' },
  { value: 'chart', label: 'Chart' },
  { value: 'quote', label: 'Quote' },
  { value: 'text', label: 'Text' },
]

// ---------------------------------------------------------------------------
// Section components
// ---------------------------------------------------------------------------

interface SectionProps {
  title: string
  children: React.ReactNode
}

function Section({ title, children }: SectionProps) {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h4>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

interface FieldProps {
  label: string
  children: React.ReactNode
}

function Field({ label, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Text element inspector
// ---------------------------------------------------------------------------

function TextElementInspector() {
  const { updateElement, selectedElementId } = usePresentationEditorStore()
  const selectedElement = usePresentationEditorStore(selectSelectedElement)

  const handleUpdate = useCallback(
    (updates: Parameters<typeof updateElement>[1]) => {
      if (selectedElementId) {
        updateElement(selectedElementId, updates)
      }
    },
    [selectedElementId, updateElement]
  )

  if (!selectedElement) return null

  return (
    <div className="space-y-4">
      {/* Font family */}
      <Field label="Font Family">
        <Select
          value={selectedElement.fontFamily ?? 'Inter'}
          onValueChange={(value) => handleUpdate({ fontFamily: value })}
        >
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FONT_FAMILIES.map((font) => (
              <SelectItem key={font.value} value={font.value}>
                {font.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {/* Font size */}
      <Field label="Size">
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={selectedElement.fontSize ?? 16}
            onChange={(e) =>
              handleUpdate({ fontSize: parseInt(e.target.value) || 16 })
            }
            className="h-9 w-20"
            min={8}
            max={200}
          />
          <span className="text-sm text-muted-foreground">px</span>
        </div>
      </Field>

      {/* Font weight */}
      <Field label="Weight">
        <Select
          value={selectedElement.fontWeight ?? 'normal'}
          onValueChange={(value) => handleUpdate({ fontWeight: value })}
        >
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="semibold">Semibold</SelectItem>
            <SelectItem value="bold">Bold</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      {/* Color */}
      <Field label="Color">
        <div className="flex items-center gap-2">
          <Input
            type="color"
            value={selectedElement.color ?? '#000000'}
            onChange={(e) => handleUpdate({ color: e.target.value })}
            className="h-9 w-12 p-1 cursor-pointer"
          />
          <Input
            type="text"
            value={selectedElement.color ?? '#000000'}
            onChange={(e) => handleUpdate({ color: e.target.value })}
            className="h-9 flex-1 font-mono text-xs"
          />
        </div>
      </Field>

      {/* Text alignment */}
      <Field label="Alignment">
        <div className="flex items-center gap-1">
          {(['left', 'center', 'right'] as const).map((align) => (
            <button
              key={align}
              onClick={() => handleUpdate({ align })}
              className={cn(
                'flex items-center justify-center w-9 h-9 rounded-md border transition-colors',
                selectedElement.align === align
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border hover:border-accent/50'
              )}
            >
              {align === 'left' && <AlignLeft className="h-4 w-4" />}
              {align === 'center' && <AlignCenter className="h-4 w-4" />}
              {align === 'right' && <AlignRight className="h-4 w-4" />}
            </button>
          ))}
        </div>
      </Field>

      {/* Line height */}
      <Field label="Line Height">
        <div className="flex items-center gap-2">
          <Slider
            value={[selectedElement.lineHeight ?? 1.5]}
            onValueChange={([value]) => handleUpdate({ lineHeight: value })}
            min={1}
            max={2.5}
            step={0.1}
            className="flex-1"
          />
          <span className="text-sm text-muted-foreground w-10 text-right">
            {selectedElement.lineHeight ?? 1.5}
          </span>
        </div>
      </Field>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Slide-level inspector
// ---------------------------------------------------------------------------

function SlideInspector() {
  const activeSlide = usePresentationEditorStore(selectActiveSlide)
  const { updateSlide, activeSlideIndex } = usePresentationEditorStore()

  const handleUpdateSlide = useCallback(
    (updates: Parameters<typeof updateSlide>[1]) => {
      updateSlide(activeSlideIndex, updates)
    },
    [activeSlideIndex, updateSlide]
  )

  if (!activeSlide) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        No slide selected
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Slide title */}
      <Field label="Title">
        <Input
          value={activeSlide.title}
          onChange={(e) => handleUpdateSlide({ title: e.target.value })}
          className="h-9"
          placeholder="Slide title"
        />
      </Field>

      {/* Subtitle */}
      <Field label="Subtitle">
        <Input
          value={activeSlide.subtitle ?? ''}
          onChange={(e) => handleUpdateSlide({ subtitle: e.target.value })}
          className="h-9"
          placeholder="Subtitle (optional)"
        />
      </Field>

      {/* Layout type */}
      <Field label="Layout">
        <Select
          value={activeSlide.layoutType}
          onValueChange={(value) =>
            handleUpdateSlide({ layoutType: value as LayoutType })
          }
        >
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LAYOUT_TYPES.map((layout) => (
              <SelectItem key={layout.value} value={layout.value}>
                {layout.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {/* Background color */}
      <Field label="Background">
        <div className="flex items-center gap-2">
          <Input
            type="color"
            value={activeSlide.background ?? '#FAFAFA'}
            onChange={(e) => handleUpdateSlide({ background: e.target.value })}
            className="h-9 w-12 p-1 cursor-pointer"
          />
          <Input
            type="text"
            value={activeSlide.background ?? '#FAFAFA'}
            onChange={(e) => handleUpdateSlide({ background: e.target.value })}
            className="h-9 flex-1 font-mono text-xs"
          />
        </div>
      </Field>

      {/* Speaker notes */}
      <Field label="Speaker Notes">
        <Textarea
          value={activeSlide.speakerNotes ?? ''}
          onChange={(e) => handleUpdateSlide({ speakerNotes: e.target.value })}
          placeholder="Add speaker notes..."
          className="min-h-[80px] text-sm"
        />
      </Field>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main SlideInspector component
// ---------------------------------------------------------------------------

export function SlideInspector() {
  const selectedElement = usePresentationEditorStore(selectSelectedElement)

  return (
    <div className="h-full flex flex-col bg-sidebar dark:bg-sidebar border-l border-border">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-sidebar-foreground">
          {selectedElement ? 'Element' : 'Slide'} Properties
        </h3>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {selectedElement ? (
          <div className="space-y-6">
            {/* Element type badge */}
            <div className="inline-flex items-center rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent">
              {selectedElement.type}
            </div>

            {/* Element-specific properties */}
            <TextElementInspector />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Slide-level properties */}
            <SlideInspector />
          </div>
        )}
      </div>
    </div>
  )
}
