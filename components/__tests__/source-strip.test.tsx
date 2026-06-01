import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { getSourceCardMetadata, SourceStrip } from '../source-strip'

describe('SourceStrip', () => {
  test('renders answer-level source cards with PRD trust details', () => {
    render(
      <SourceStrip
        citationMaps={{
          tool_1: {
            1: {
              title: 'Brok search architecture',
              url: 'https://docs.brok.ai/search',
              content: 'Search documentation with citations and source cards.',
              publishedDate: '2026-05-12T12:00:00.000Z'
            },
            2: {
              title: 'Brok API overview',
              url: 'https://docs.brok.ai/api',
              content: 'OpenAI-compatible routes and usage tracking.',
              publisher: 'docs.brok.ai'
            }
          }
        }}
      />
    )

    expect(screen.getByLabelText('Answer sources')).toBeInTheDocument()
    expect(screen.getByText('Brok search architecture')).toBeInTheDocument()
    expect(screen.getAllByText('docs.brok.ai')).toHaveLength(2)
    expect(
      screen.getByText('Search documentation with citations and source cards.')
    ).toBeInTheDocument()
    expect(screen.getByText('May 12, 2026')).toBeInTheDocument()
    expect(screen.getAllByText('Open source')).toHaveLength(2)
  })

  test('normalizes optional source metadata for source cards', () => {
    expect(
      getSourceCardMetadata({
        title: '',
        url: 'https://www.example.edu/report',
        content: '',
        snippet: 'Reported source excerpt.',
        date: '2026-06-01T12:00:00.000Z'
      })
    ).toEqual({
      title: 'example',
      host: 'example.edu',
      date: 'Jun 1, 2026',
      snippet: 'Reported source excerpt.'
    })
  })
})
