'use client'

import { create } from 'zustand'

import type { Theme } from '@/lib/presentations/themes'
import { generateUUID } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Slide content types
// ---------------------------------------------------------------------------

export type LayoutType =
  | 'title'
  | 'section'
  | 'two_column'
  | 'image_left'
  | 'chart'
  | 'quote'
  | 'text'

export interface SlideElement {
  id: string
  type: 'heading' | 'body' | 'bullet' | 'image' | 'quote' | 'chart'
  content: string
  // Style properties
  fontFamily?: string
  fontSize?: number
  fontWeight?: string
  color?: string
  align?: 'left' | 'center' | 'right'
  lineHeight?: number
}

export interface SlideContent {
  id: string
  title: string
  subtitle?: string
  layoutType: LayoutType
  bullets?: string[]
  imageUrl?: string
  imagePrompt?: string
  chartData?: Record<string, unknown>
  quoteText?: string
  quoteAttribution?: string
  background?: string
  speakerNotes?: string
  elements?: SlideElement[]
}

// ---------------------------------------------------------------------------
// Editor state
// ---------------------------------------------------------------------------

export interface PresentationEditorState {
  // Core state
  presentationId: string | null
  title: string
  slides: SlideContent[]
  activeSlideIndex: number
  selectedElementId: string | null
  theme: Theme
  isSaving: boolean
  isGenerating: boolean

  // Computed helpers
  activeSlide: SlideContent | null
  selectedElement: SlideElement | null

  // Actions
  setPresentationId: (id: string) => void
  setTitle: (title: string) => void
  setSlides: (slides: SlideContent[]) => void
  selectSlide: (index: number) => void
  updateSlide: (index: number, updates: Partial<SlideContent>) => void
  reorderSlides: (fromIndex: number, toIndex: number) => void
  addSlide: (afterIndex?: number) => void
  duplicateSlide: (index: number) => void
  deleteSlide: (index: number) => void
  selectElement: (elementId: string | null) => void
  updateElement: (elementId: string, updates: Partial<SlideElement>) => void
  addElement: (slideIndex: number, element: Omit<SlideElement, 'id'>) => void
  deleteElement: (slideIndex: number, elementId: string) => void
  setTheme: (theme: Theme) => void
  setIsSaving: (isSaving: boolean) => void
  setIsGenerating: (isGenerating: boolean) => void
  loadPresentation: (data: {
    id: string
    title: string
    slides: SlideContent[]
    theme: Theme
  }) => void
}

// ---------------------------------------------------------------------------
// Default slide factory
// ---------------------------------------------------------------------------

function createDefaultSlide(index: number): SlideContent {
  return {
    id: generateUUID(),
    title: `Slide ${index + 1}`,
    layoutType: 'title',
    bullets: [],
    elements: [
      {
        id: generateUUID(),
        type: 'heading',
        content: `Slide ${index + 1}`,
        fontFamily: 'Inter',
        fontSize: 48,
        fontWeight: 'bold',
        color: '#1A1A1A',
        align: 'center',
      },
    ],
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const usePresentationEditorStore =
  create<PresentationEditorState>((set, get) => ({
    // Initial state
    presentationId: null,
    title: 'Untitled Presentation',
    slides: [createDefaultSlide(0)],
    activeSlideIndex: 0,
    selectedElementId: null,
    theme: {
      id: 'minimal_light',
      name: 'Minimal Light',
      colors: {
        background: '#FAFAFA',
        text: '#1A1A1A',
        accent: '#6366F1',
        secondary: '#E5E7EB',
        card: '#FFFFFF',
      },
      fonts: {
        heading: 'Inter',
        body: 'Inter',
      },
      slideLayouts: ['title', 'section', 'two_column', 'image_left', 'chart', 'quote', 'text'],
    },
    isSaving: false,
    isGenerating: false,

    // Computed getters
    get activeSlide() {
      const { slides, activeSlideIndex } = get()
      return slides[activeSlideIndex] ?? null
    },

    get selectedElement() {
      const { slides, activeSlideIndex, selectedElementId } = get()
      const slide = slides[activeSlideIndex]
      if (!slide || !selectedElementId || !slide.elements) return null
      return slide.elements.find((el) => el.id === selectedElementId) ?? null
    },

    // Actions
    setPresentationId: (id) => set({ presentationId: id }),

    setTitle: (title) => set({ title }),

    setSlides: (slides) => set({ slides }),

    selectSlide: (index) => {
      const { slides } = get()
      if (index >= 0 && index < slides.length) {
        set({ activeSlideIndex: index, selectedElementId: null })
      }
    },

    updateSlide: (index, updates) => {
      const { slides } = get()
      const newSlides = [...slides]
      if (newSlides[index]) {
        newSlides[index] = { ...newSlides[index], ...updates }
        set({ slides: newSlides })
      }
    },

    reorderSlides: (fromIndex, toIndex) => {
      const { slides } = get()
      if (
        fromIndex < 0 ||
        fromIndex >= slides.length ||
        toIndex < 0 ||
        toIndex >= slides.length
      )
        return

      const newSlides = [...slides]
      const [removed] = newSlides.splice(fromIndex, 1)
      newSlides.splice(toIndex, 0, removed)

      // Update active slide index if needed
      let newActiveIndex = get().activeSlideIndex
      if (fromIndex === get().activeSlideIndex) {
        newActiveIndex = toIndex
      } else if (
        fromIndex < get().activeSlideIndex &&
        toIndex >= get().activeSlideIndex
      ) {
        newActiveIndex--
      } else if (
        fromIndex > get().activeSlideIndex &&
        toIndex <= get().activeSlideIndex
      ) {
        newActiveIndex++
      }

      set({ slides: newSlides, activeSlideIndex: newActiveIndex })
    },

    addSlide: (afterIndex) => {
      const { slides } = get()
      const insertAt = afterIndex !== undefined ? afterIndex + 1 : slides.length
      const newSlide = createDefaultSlide(insertAt)
      const newSlides = [...slides]
      newSlides.splice(insertAt, 0, newSlide)
      set({ slides: newSlides, activeSlideIndex: insertAt, selectedElementId: null })
    },

    duplicateSlide: (index) => {
      const { slides } = get()
      if (index < 0 || index >= slides.length) return

      const original = slides[index]
      const duplicate: SlideContent = {
        ...JSON.parse(JSON.stringify(original)),
        id: generateUUID(),
        title: `${original.title} (copy)`,
        elements: original.elements?.map((el) => ({
          ...el,
          id: generateUUID(),
        })),
      }

      const newSlides = [...slides]
      newSlides.splice(index + 1, 0, duplicate)
      set({ slides: newSlides, activeSlideIndex: index + 1 })
    },

    deleteSlide: (index) => {
      const { slides, activeSlideIndex } = get()
      if (slides.length <= 1) return // Prevent deleting last slide

      const newSlides = slides.filter((_, i) => i !== index)
      let newActiveIndex = activeSlideIndex
      if (index < activeSlideIndex) {
        newActiveIndex--
      } else if (index === activeSlideIndex) {
        newActiveIndex = Math.min(activeSlideIndex, newSlides.length - 1)
      }

      set({ slides: newSlides, activeSlideIndex: newActiveIndex, selectedElementId: null })
    },

    selectElement: (elementId) => set({ selectedElementId: elementId }),

    updateElement: (elementId, updates) => {
      const { slides, activeSlideIndex } = get()
      const slide = slides[activeSlideIndex]
      if (!slide || !slide.elements) return

      const newElements = slide.elements.map((el) =>
        el.id === elementId ? { ...el, ...updates } : el
      )

      const newSlides = [...slides]
      newSlides[activeSlideIndex] = { ...slide, elements: newElements }
      set({ slides: newSlides })
    },

    addElement: (slideIndex, element) => {
      const { slides } = get()
      const slide = slides[slideIndex]
      if (!slide) return

      const newElement: SlideElement = {
        ...element,
        id: generateUUID(),
      }

      const newElements = [...(slide.elements || []), newElement]
      const newSlides = [...slides]
      newSlides[slideIndex] = { ...slide, elements: newElements }
      set({ slides: newSlides })
    },

    deleteElement: (slideIndex, elementId) => {
      const { slides, selectedElementId } = get()
      const slide = slides[slideIndex]
      if (!slide || !slide.elements) return

      const newElements = slide.elements.filter((el) => el.id !== elementId)
      const newSlides = [...slides]
      newSlides[slideIndex] = { ...slide, elements: newElements }

      set({
        slides: newSlides,
        selectedElementId:
          selectedElementId === elementId ? null : selectedElementId,
      })
    },

    setTheme: (theme) => set({ theme }),

    setIsSaving: (isSaving) => set({ isSaving }),

    setIsGenerating: (isGenerating) => set({ isGenerating }),

    loadPresentation: (data) => {
      set({
        presentationId: data.id,
        title: data.title,
        slides: data.slides.length > 0 ? data.slides : [createDefaultSlide(0)],
        activeSlideIndex: 0,
        selectedElementId: null,
        theme: data.theme,
        isSaving: false,
        isGenerating: false,
      })
    },
  }))

// Computed selectors
export const selectActiveSlide = (state: PresentationEditorState) =>
  state.slides[state.activeSlideIndex] ?? null

export const selectSelectedElement = (state: PresentationEditorState) => {
  const slide = state.slides[state.activeSlideIndex]
  if (!slide || !state.selectedElementId || !slide.elements) return null
  return slide.elements.find((el) => el.id === state.selectedElementId) ?? null
}
