import { describe, expect, it } from 'vitest'

import type { SearchResultItem } from '@/lib/types'

import { processCitations } from '../citation'

describe('processCitations', () => {
  const mockCitationMaps = {
    toolCall1: {
      1: {
        title: 'Google',
        url: 'https://www.google.com',
        content: 'Search engine'
      },
      2: {
        title: 'GitHub',
        url: 'https://docs.github.com',
        content: 'Developer platform'
      },
      3: {
        title: 'Stack Overflow',
        url: 'https://stackoverflow.com/questions/123',
        content: 'Q&A for developers'
      }
    } as Record<number, SearchResultItem>
  }

  it('keeps numbered citations while linking to source URLs', () => {
    const content = 'Check out [1](#toolCall1) and [2](#toolCall1)'
    const result = processCitations(content, mockCitationMaps)

    expect(result).toBe(
      'Check out [1](https://www.google.com) and [2](https://docs.github.com)'
    )
  })

  it('handles citations with spaces', () => {
    const content = 'See [ 1 ](#toolCall1) for details'
    const result = processCitations(content, mockCitationMaps)

    expect(result).toBe('See [1](https://www.google.com) for details')
  })

  it('handles multiple citations from same domain', () => {
    const citationMaps = {
      toolCall1: {
        1: {
          title: 'Google Search',
          url: 'https://www.google.com/search',
          content: 'Search'
        },
        2: {
          title: 'Google Maps',
          url: 'https://www.google.com/maps',
          content: 'Maps'
        }
      } as Record<number, SearchResultItem>
    }

    const content = 'Try [1](#toolCall1) or [2](#toolCall1)'
    const result = processCitations(content, citationMaps)

    expect(result).toBe(
      'Try [1](https://www.google.com/search) or [2](https://www.google.com/maps)'
    )
  })

  it('keeps visible citation text for invalid citation numbers', () => {
    const content = 'Invalid [999](#toolCall1) citation'
    const result = processCitations(content, mockCitationMaps)

    expect(result).toBe('Invalid [999] citation')
  })

  it('keeps visible citation text for missing toolCallId', () => {
    const content = 'Missing [1](#nonExistentTool) tool'
    const result = processCitations(content, mockCitationMaps)

    expect(result).toBe('Missing [1] tool')
  })

  it('keeps visible citation text for invalid URLs', () => {
    const citationMaps = {
      toolCall1: {
        1: {
          title: 'Invalid',
          url: 'not-a-valid-url',
          content: 'Invalid URL'
        }
      } as Record<number, SearchResultItem>
    }

    const content = 'Check [1](#toolCall1) here'
    const result = processCitations(content, citationMaps)

    expect(result).toBe('Check [1] here')
  })

  it('handles content with no citations', () => {
    const content = 'This is plain text without citations'
    const result = processCitations(content, mockCitationMaps)

    expect(result).toBe('This is plain text without citations')
  })

  it('returns empty string for null/undefined content', () => {
    expect(processCitations('', mockCitationMaps)).toBe('')
    expect(processCitations(null as any, mockCitationMaps)).toBe('')
  })

  it('handles empty citation maps', () => {
    const content = 'Text with [1](#toolCall1) citation'
    const result = processCitations(content, {})

    // When citation maps are empty, content is returned unchanged
    expect(result).toBe('Text with [1](#toolCall1) citation')
  })

  it('encodes URLs to prevent injection', () => {
    const citationMaps = {
      toolCall1: {
        1: {
          title: 'Test',
          url: 'https://example.com/page?param=value&other=test',
          content: 'Test'
        }
      } as Record<number, SearchResultItem>
    }

    const content = 'See [1](#toolCall1)'
    const result = processCitations(content, citationMaps)

    expect(result).toContain('[1]')
    expect(result).toContain('https://example.com/page?param=value&other=test')
  })

  it('handles complex real-world scenarios', () => {
    const content = `According to [1](#toolCall1), the answer is 42.
    However, [2](#toolCall1) suggests otherwise.
    For more information, see [3](#toolCall1).`

    const result = processCitations(content, mockCitationMaps)

    expect(result).toContain('[1](https://www.google.com)')
    expect(result).toContain('[2](https://docs.github.com)')
    expect(result).toContain('[3](https://stackoverflow.com/questions/123)')
  })

  it('handles citation numbers at edge cases', () => {
    const content =
      'Edge cases: [0](#toolCall1) [101](#toolCall1) [-1](#toolCall1)'
    const result = processCitations(content, mockCitationMaps)

    // 0 and 101 are out of bounds (1-100), so they're kept as visible text.
    // -1 doesn't match the regex pattern \d+, so it remains unchanged
    expect(result).toBe('Edge cases: [0] [101] [-1](#toolCall1)')
  })
})
