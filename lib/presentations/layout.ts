export const LAYOUT_TYPES = [
  'title',
  'section',
  'two_column',
  'image_left',
  'chart',
  'quote',
  'text',
  'bullet'
] as const

export type LayoutType = (typeof LAYOUT_TYPES)[number]

export function isLayoutType(value: unknown): value is LayoutType {
  return (
    typeof value === 'string' &&
    (LAYOUT_TYPES as readonly string[]).includes(value)
  )
}

type LayoutInput = {
  title: string
  body: string[]
  bullets: string[]
  notes?: string
}

export function inferLayoutType(slide: LayoutInput): LayoutType {
  if (slide.bullets.length > 0) return 'bullet'
  if (slide.body.length === 0) return 'section'
  if (slide.body[0]?.startsWith('"') && slide.body[0]?.endsWith('"'))
    return 'quote'
  if (slide.body.length === 1) return 'title'
  return 'text'
}
