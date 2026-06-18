import { describe, expect, it } from 'vitest'

import { countAnswerMetadataSources } from '@/lib/library/answer-metadata-sources'

describe('library actions', () => {
  describe('countAnswerMetadataSources', () => {
    it('counts unique durable answer metadata source URLs', () => {
      expect(
        countAnswerMetadataSources({
          answer: {
            sources: [
              { title: 'One', url: 'https://example.com/a' },
              { title: 'Duplicate', url: 'https://example.com/a' },
              { title: 'Two', url: 'https://example.com/b' }
            ],
            citationCount: 8
          }
        })
      ).toBe(2)
    })

    it('falls back to citationCount when sources are unavailable', () => {
      expect(
        countAnswerMetadataSources({
          answer: {
            citationCount: 3
          }
        })
      ).toBe(3)
    })

    it('ignores missing or invalid answer metadata', () => {
      expect(countAnswerMetadataSources(null)).toBe(0)
      expect(countAnswerMetadataSources({ answer: null })).toBe(0)
      expect(
        countAnswerMetadataSources({
          answer: {
            sources: [{ title: 'Missing URL' }],
            citationCount: -1
          }
        })
      ).toBe(0)
    })
  })
})
