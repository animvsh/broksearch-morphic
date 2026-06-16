import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn()
  })
}))

vi.mock('../message', () => ({
  MarkdownMessage: ({ message }: { message: string }) => (
    <div data-testid="markdown-message">{message}</div>
  )
}))

vi.mock('../related-questions-panel', () => ({
  RelatedQuestionsPanel: () => <aside data-testid="related-questions" />
}))

vi.mock('../voice-input-button', () => ({
  VoiceInputButton: () => <button type="button">Voice input</button>,
  VoiceOutputButton: () => <button type="button">Read answer</button>
}))

vi.mock('../follow-up-chips', () => ({
  FollowUpChips: ({
    followUps
  }: {
    followUps: Array<{ label?: string; query: string }>
  }) => (
    <div data-testid="follow-up-chips">
      {followUps.map(followUp => followUp.label ?? followUp.query).join(', ')}
    </div>
  )
}))

import { BrokSearchClient } from '../brok-search-client'

function streamResponse(events: Array<{ event: string; data: unknown }>) {
  const encoder = new TextEncoder()
  const body = events
    .map(
      event => `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`
    )
    .join('')

  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(body))
        controller.close()
      }
    }),
    {
      status: 200,
      headers: { 'content-type': 'text/event-stream' }
    }
  )
}

describe('BrokSearchClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('uses the browser-safe session stream endpoint by default', async () => {
    const fetchMock = vi.fn(async () =>
      streamResponse([
        {
          event: 'status',
          data: { message: 'Searching web' }
        },
        {
          event: 'query',
          data: { query: 'What is Brok?', mode: 'search', depth: 'standard' }
        },
        {
          event: 'source_found',
          data: {
            source: {
              id: 'src_1',
              title: 'Brok docs',
              url: 'https://docs.example.com/search',
              publisher: 'docs.example.com',
              snippet: 'Brok search docs.',
              retrievedAt: '2026-06-16T00:00:00.000Z',
              qualityScore: 91
            }
          }
        },
        {
          event: 'answer_delta',
          data: { delta: 'Brok answers with sources. [1]' }
        },
        {
          event: 'follow_ups',
          data: {
            items: [
              {
                label: 'How does Brok cite sources?',
                query: 'How does Brok cite sources?'
              }
            ]
          }
        },
        {
          event: 'done',
          data: { usage: { total_tokens: 12 } }
        }
      ])
    )
    vi.stubGlobal('fetch', fetchMock)

    render(<BrokSearchClient initialQuery="What is Brok?" />)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/search/session',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ query: 'What is Brok?', stream: true })
        })
      )
    })

    expect(await screen.findByTestId('brok-search-sources')).toHaveTextContent(
      'Brok docs'
    )
    expect(screen.getByTestId('markdown-message')).toHaveTextContent(
      'Brok answers with sources. [1]'
    )
    expect(screen.getByTestId('follow-up-chips')).toHaveTextContent(
      'How does Brok cite sources?'
    )
  })
})
