import { parsePresentationMarkdown } from './deck'

export const MIN_SLIDES = 3
export const MAX_SLIDES = 24
export const MAX_PROMPT_LENGTH = 4000

export function chooseSlideCount(prompt: string): number {
  const len = prompt.trim().length
  if (len < 80) return 5
  if (len < 240) return 7
  if (len < 800) return 9
  return Math.min(MAX_SLIDES, 11)
}

export function clampSlideCount(requested: number, _prompt: string): number {
  if (!Number.isFinite(requested) || requested <= 0) {
    return MIN_SLIDES
  }
  const rounded = Math.round(requested)
  return Math.max(MIN_SLIDES, Math.min(MAX_SLIDES, rounded))
}

const SECTION_TITLES = [
  'Context',
  'Problem',
  'Approach',
  'Evidence',
  'Tradeoffs',
  'Recommendation',
  'What we learned',
  'Open questions'
] as const

function sectionTitleForIndex(index: number, total: number): string {
  const offset = index - 2
  return SECTION_TITLES[offset % SECTION_TITLES.length] ?? `Section ${index}`
}

export function deterministicOutline(prompt: string, count: number): string {
  const topic = prompt.trim() || 'Your story'
  const slides: string[] = []
  const closing = count
  const recap = count - 1

  const openingLines = [
    `# ${topic}`,
    'kicker: A Brok-generated outline',
    'This is a deterministic fallback outline. Configure OPENAI_COMPATIBLE_API_KEY to enable live LLM generation.'
  ]
  slides.push(openingLines.join('\n'))

  for (let i = 2; i <= count; i += 1) {
    const slideLines: string[] = []

    if (i === closing) {
      slideLines.push('# Next steps')
      slideLines.push(
        'kicker: Closing',
        'Decide which sections need real research and which can ship as-is.'
      )
    } else if (i === recap && count >= 5) {
      slideLines.push('# Recap')
      slideLines.push(
        '- Pull together the three strongest points from above.',
        '- End with a clear call to action.'
      )
    } else {
      const sectionTitle = sectionTitleForIndex(i, count)
      slideLines.push(`# ${sectionTitle}`)
      slideLines.push(`kicker: Step ${i - 1} of ${Math.max(count - 2, 1)}`)
      slideLines.push('Expand on this beat in 2-3 sentences.')
      slideLines.push('- Lead with the most important finding or argument')
      slideLines.push('- Add a supporting data point or example')
      slideLines.push('- Connect back to the opening hook')
      slideLines.push(
        'notes: Open with the punchline; close with the next step.'
      )
    }

    slides.push(slideLines.join('\n'))
  }

  return slides.join('\n\n---\n\n')
}

export function slideCountForPrompt(prompt: string): number {
  return chooseSlideCount(prompt)
}

export function parseAndCount(source: string): number {
  return parsePresentationMarkdown(source).length
}
