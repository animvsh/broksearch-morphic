import { describe, expect, it } from 'vitest'

import {
  parsePresentationMarkdown,
  samplePresentationSource
} from '@/lib/presentations/deck'

describe('presentation deck parser', () => {
  it('parses the starter deck into reveal-ready slides', () => {
    const slides = parsePresentationMarkdown(samplePresentationSource)

    expect(slides).toHaveLength(3)
    expect(slides[0]).toMatchObject({
      id: 'brok-presentations-1',
      title: 'Brok Presentations',
      kicker: 'Reveal.js workspace'
    })
    expect(slides[0].bullets).toContain(
      'Preview a real reveal.js deck on the right'
    )
    expect(slides[0].notes).toContain('Open with the user problem')
  })

  it('keeps body copy, bullets, and notes in separate fields', () => {
    const slides = parsePresentationMarkdown(`# Launch Review
Kicker: Weekly
This is the narrative setup.
- Metric one
- Metric two
Notes: Ask for the decision before showing risks.`)

    expect(slides).toEqual([
      {
        id: 'launch-review-1',
        title: 'Launch Review',
        kicker: 'Weekly',
        body: ['This is the narrative setup.'],
        bullets: ['Metric one', 'Metric two'],
        notes: 'Ask for the decision before showing risks.'
      }
    ])
  })

  it('falls back to the starter deck when the source is empty', () => {
    expect(parsePresentationMarkdown('')).toHaveLength(3)
  })
})
