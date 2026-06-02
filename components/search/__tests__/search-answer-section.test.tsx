import { describe, expect, it } from 'vitest'

import type { SearchResultItem } from '@/lib/types'

import { extractSources } from '../search-answer-section'

describe('extractSources', () => {
  it('keeps source card ids unique across multiple search tool calls', () => {
    const citationMaps = {
      searchA: {
        1: source({
          title: 'First source',
          url: 'https://example.com/first'
        })
      },
      searchB: {
        1: source({
          title: 'Second source',
          url: 'https://example.com/second'
        })
      }
    }

    const sources = extractSources(citationMaps)

    expect(sources.map(item => item.id)).toEqual(['searchA:1', 'searchB:1'])
    expect(new Set(sources.map(item => item.id))).toHaveLength(sources.length)
  })

  it('dedupes the same source when only tracking parameters differ', () => {
    const citationMaps = {
      searchA: {
        1: source({
          title: 'Original',
          url: 'https://example.com/report?utm_source=search#section'
        })
      },
      searchB: {
        1: source({
          title: 'Duplicate',
          url: 'https://example.com/report'
        })
      }
    }

    const sources = extractSources(citationMaps)

    expect(sources).toHaveLength(1)
    expect(sources[0]).toMatchObject({
      id: 'searchA:1',
      title: 'Original',
      domain: 'example.com'
    })
  })
})

function source({
  title,
  url
}: {
  title: string
  url: string
}): SearchResultItem {
  return {
    title,
    url,
    content: `${title} content`
  }
}
