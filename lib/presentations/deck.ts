export type PresentationSlide = {
  id: string
  title: string
  kicker?: string
  body: string[]
  bullets: string[]
  notes?: string
}

export const samplePresentationSource = `# Brok Presentations
Kicker: Reveal.js workspace
Brok can turn a working idea into a polished narrative without leaving the app.
- Edit slide source on the left
- Preview a real reveal.js deck on the right
- Navigate and reset instantly
Notes: Open with the user problem, then show the deck taking shape live.

---

# Research to Story
Brok already gathers sources, artifacts, and decisions. Presentations give that work a durable room.
- Search findings become claims
- Citations become backup material
- Sections become a deck outline

---

# Ship the Brief
Use the generated starter deck as a base, then refine the message for sales, updates, or internal reviews.
- Keep the narrative editable
- Use speaker notes for delivery
- Export hooks can land next`

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function parseSlideBlock(
  block: string,
  index: number
): PresentationSlide | null {
  const lines = block
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)

  if (lines.length === 0) return null

  let title = `Slide ${index + 1}`
  let kicker: string | undefined
  const body: string[] = []
  const bullets: string[] = []
  const notes: string[] = []
  let readingNotes = false

  for (const line of lines) {
    const heading = line.match(/^#{1,3}\s+(.+)$/)
    const kickerMatch = line.match(/^kicker:\s*(.+)$/i)
    const notesMatch = line.match(/^notes:\s*(.*)$/i)
    const bullet = line.match(/^[-*]\s+(.+)$/)

    if (heading) {
      title = heading[1]
      readingNotes = false
      continue
    }

    if (kickerMatch) {
      kicker = kickerMatch[1]
      readingNotes = false
      continue
    }

    if (notesMatch) {
      readingNotes = true
      if (notesMatch[1]) notes.push(notesMatch[1])
      continue
    }

    if (readingNotes) {
      notes.push(line)
      continue
    }

    if (bullet) {
      bullets.push(bullet[1])
      continue
    }

    body.push(line)
  }

  return {
    id: `${slugify(title) || 'slide'}-${index + 1}`,
    title,
    kicker,
    body,
    bullets,
    notes: notes.length > 0 ? notes.join(' ') : undefined
  }
}

export function parsePresentationMarkdown(source: string): PresentationSlide[] {
  const normalizedSource = source.trim()
  const blocks = normalizedSource
    ? normalizedSource.split(/^\s*---+\s*$/m)
    : samplePresentationSource.split(/^\s*---+\s*$/m)

  const slides = blocks
    .map(parseSlideBlock)
    .filter((slide): slide is PresentationSlide => Boolean(slide))

  return slides.length > 0
    ? slides
    : parsePresentationMarkdown(samplePresentationSource)
}
