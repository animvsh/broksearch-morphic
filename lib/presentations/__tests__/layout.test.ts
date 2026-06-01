import { describe, expect, it } from 'vitest'

import { inferLayoutType, isLayoutType, LAYOUT_TYPES } from '../layout'

describe('presentations/layout', () => {
  it('exposes the eight canonical layout types', () => {
    expect(LAYOUT_TYPES).toEqual([
      'title',
      'section',
      'two_column',
      'image_left',
      'chart',
      'quote',
      'text',
      'bullet'
    ])
  })

  describe('isLayoutType', () => {
    it('accepts the canonical layout values', () => {
      for (const value of LAYOUT_TYPES) {
        expect(isLayoutType(value)).toBe(true)
      }
    })

    it('rejects unknown values', () => {
      expect(isLayoutType('bogus')).toBe(false)
      expect(isLayoutType(null)).toBe(false)
      expect(isLayoutType(undefined)).toBe(false)
      expect(isLayoutType(42)).toBe(false)
      expect(isLayoutType({})).toBe(false)
    })
  })

  describe('inferLayoutType', () => {
    it('returns "bullet" when the slide has bullets', () => {
      expect(
        inferLayoutType({ title: 'x', body: ['paragraph'], bullets: ['b'] })
      ).toBe('bullet')
    })

    it('returns "section" for empty-body slides with no bullets', () => {
      expect(inferLayoutType({ title: 'x', body: [], bullets: [] })).toBe(
        'section'
      )
    })

    it('returns "quote" for a single body line wrapped in quotes', () => {
      expect(
        inferLayoutType({
          title: 'x',
          body: ['"Stay hungry, stay foolish"'],
          bullets: []
        })
      ).toBe('quote')
    })

    it('returns "title" for a single short body line', () => {
      expect(
        inferLayoutType({
          title: 'x',
          body: ['Welcome to the show'],
          bullets: []
        })
      ).toBe('title')
    })

    it('returns "text" for multi-paragraph bodies without bullets', () => {
      expect(
        inferLayoutType({
          title: 'x',
          body: ['Para one', 'Para two', 'Para three'],
          bullets: []
        })
      ).toBe('text')
    })
  })
})
