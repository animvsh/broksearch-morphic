import { describe, expect, it } from 'vitest'

import { parsePresentationMarkdown } from '../deck'
import {
  chooseSlideCount,
  clampSlideCount,
  deterministicOutline,
  MAX_SLIDES,
  MIN_SLIDES,
  parseAndCount,
  slideCountForPrompt
} from '../generate'

describe('presentations/generate', () => {
  describe('chooseSlideCount', () => {
    it('returns 5 for short prompts', () => {
      expect(chooseSlideCount('hi')).toBe(5)
      expect(chooseSlideCount('a'.repeat(70))).toBe(5)
    })

    it('returns 7 for medium prompts', () => {
      expect(chooseSlideCount('a'.repeat(200))).toBe(7)
      expect(chooseSlideCount('a'.repeat(239))).toBe(7)
    })

    it('returns 9 for long prompts', () => {
      expect(chooseSlideCount('a'.repeat(500))).toBe(9)
    })

    it('caps at MAX_SLIDES-1 for very long prompts', () => {
      expect(chooseSlideCount('a'.repeat(5000))).toBe(11)
    })
  })

  describe('clampSlideCount', () => {
    it('clamps below the minimum', () => {
      expect(clampSlideCount(0, 'x')).toBe(MIN_SLIDES)
      expect(clampSlideCount(-10, 'x')).toBe(MIN_SLIDES)
    })

    it('clamps above the maximum', () => {
      expect(clampSlideCount(100, 'x')).toBe(MAX_SLIDES)
    })

    it('preserves in-range values', () => {
      expect(clampSlideCount(7, 'x')).toBe(7)
    })

    it('falls back to MIN_SLIDES when given a non-positive number', () => {
      expect(clampSlideCount(0, 'short')).toBe(MIN_SLIDES)
    })

    it('rounds fractional values', () => {
      expect(clampSlideCount(7.4, 'x')).toBe(7)
      expect(clampSlideCount(7.6, 'x')).toBe(8)
    })
  })

  describe('slideCountForPrompt', () => {
    it('matches clampSlideCount with no explicit count', () => {
      expect(slideCountForPrompt('hi')).toBe(5)
      expect(slideCountForPrompt('a'.repeat(900))).toBe(11)
    })
  })

  describe('deterministicOutline', () => {
    it('produces a parseable deck of the requested size', () => {
      const outline = deterministicOutline('Quarterly product review', 7)
      const slides = parsePresentationMarkdown(outline)
      expect(slides).toHaveLength(7)
      expect(slides[0]?.title).toBe('Quarterly product review')
    })

    it('uses the prompt as the first slide title', () => {
      const outline = deterministicOutline('The future of AI', 5)
      const slides = parsePresentationMarkdown(outline)
      expect(slides[0]?.title).toBe('The future of AI')
    })

    it('falls back to a generic title for empty prompts', () => {
      const outline = deterministicOutline('', 4)
      const slides = parsePresentationMarkdown(outline)
      expect(slides[0]?.title).toBe('Your story')
    })

    it('includes a closing slide', () => {
      const outline = deterministicOutline('Topic', 5)
      const slides = parsePresentationMarkdown(outline)
      const last = slides[slides.length - 1]
      expect(last?.title).toBe('Next steps')
    })

    it('inserts a recap slide before the closing when there is room', () => {
      const outline = deterministicOutline('Topic', 6)
      const slides = parsePresentationMarkdown(outline)
      expect(slides.map(s => s.title)).toContain('Recap')
    })

    it('omits the recap when the deck is too small', () => {
      const outline = deterministicOutline('Topic', 4)
      const slides = parsePresentationMarkdown(outline)
      expect(slides.map(s => s.title)).not.toContain('Recap')
    })

    it('parses to a count matching the request', () => {
      for (const count of [3, 4, 5, 7, 9, 11]) {
        const outline = deterministicOutline('Some topic', count)
        expect(parseAndCount(outline)).toBe(count)
      }
    })
  })
})
