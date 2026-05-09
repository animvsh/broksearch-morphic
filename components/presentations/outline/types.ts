export type LayoutType =
  | 'title'
  | 'section'
  | 'two_column'
  | 'image_left'
  | 'chart'
  | 'quote'
  | 'text'

export interface OutlineSlide {
  title: string
  layout_type: LayoutType
  bullets: string[]
}

export interface Outline {
  slides: OutlineSlide[]
}

export const LAYOUT_LABELS: Record<LayoutType, string> = {
  title: 'Title Slide',
  section: 'Section',
  two_column: 'Two Column',
  image_left: 'Image Left',
  chart: 'Chart',
  quote: 'Quote',
  text: 'Text'
}

export const LAYOUT_OPTIONS: { value: LayoutType; label: string }[] = [
  { value: 'title', label: 'Title Slide' },
  { value: 'section', label: 'Section' },
  { value: 'two_column', label: 'Two Column' },
  { value: 'image_left', label: 'Image Left' },
  { value: 'chart', label: 'Chart' },
  { value: 'quote', label: 'Quote' },
  { value: 'text', label: 'Text' }
]
