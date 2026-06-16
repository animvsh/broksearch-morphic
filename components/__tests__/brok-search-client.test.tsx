import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  const storage = new Map<string, string>()

  beforeEach(() => {
    vi.restoreAllMocks()
    storage.clear()
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: vi.fn((key: string) => storage.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => {
          storage.set(key, value)
        }),
        removeItem: vi.fn((key: string) => {
          storage.delete(key)
        }),
        clear: vi.fn(() => {
          storage.clear()
        })
      }
    })
    window.history.replaceState({}, '', '/search?q=What+is+Brok%3F&mode=quick')
    window.localStorage.clear()
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

    render(
      <BrokSearchClient
        initialQuery="What is Brok?"
        initialMode="search"
        searchId="search_test"
      />
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/search/session',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            query: 'What is Brok?',
            mode: 'search',
            stream: true
          })
        })
      )
    })

    expect(window.location.pathname).toBe('/search/search_test')
    expect(window.location.search).toBe('')

    expect(await screen.findByTestId('brok-search-sources')).toHaveTextContent(
      'Brok docs'
    )
    expect(screen.getByTestId('markdown-message')).toHaveTextContent(
      'Brok answers with sources. [1]'
    )
    expect(screen.getByTestId('follow-up-chips')).toHaveTextContent(
      'How does Brok cite sources?'
    )

    const persisted = JSON.parse(
      window.localStorage.getItem('brok:guest-chat:search_test') ?? '[]'
    )
    expect(persisted).toHaveLength(2)
    expect(persisted[0]).toMatchObject({
      id: 'search_test_user',
      role: 'user',
      parts: [{ type: 'text', text: 'What is Brok?' }]
    })
    expect(persisted[1]).toMatchObject({
      id: 'search_test_assistant',
      role: 'assistant',
      parts: [{ type: 'text', text: 'Brok answers with sources. [1]' }],
      metadata: {
        searchMode: 'search',
        modelId: 'brok-session-search',
        answer: {
          citationCount: 1
        }
      }
    })
    expect(persisted[1].metadata.answer.sources[0]).toMatchObject({
      title: 'Brok docs',
      url: 'https://docs.example.com/search',
      content: 'Brok search docs.'
    })
  })

  it('asks follow-ups in the same durable search thread', async () => {
    const fetchMock = vi.fn(async (_url, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { query: string }
      if (body.query === 'What is Brok?') {
        return streamResponse([
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
            event: 'done',
            data: {}
          }
        ])
      }

      return streamResponse([
        {
          event: 'source_found',
          data: {
            source: {
              id: 'src_2',
              title: 'Citation guide',
              url: 'https://docs.example.com/citations',
              publisher: 'docs.example.com',
              snippet: 'Brok cites source cards.',
              retrievedAt: '2026-06-16T00:00:00.000Z',
              qualityScore: 88
            }
          }
        },
        {
          event: 'answer_delta',
          data: { delta: 'Brok cites each answer with source cards. [1]' }
        },
        {
          event: 'done',
          data: {}
        }
      ])
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <BrokSearchClient
        initialQuery="What is Brok?"
        initialMode="search"
        searchId="search_test"
      />
    )

    expect(await screen.findByTestId('brok-search-answer')).toHaveTextContent(
      'Brok answers with sources. [1]'
    )

    fireEvent.change(screen.getByLabelText('Ask a follow-up'), {
      target: { value: 'How does Brok cite sources?' }
    })
    fireEvent.submit(screen.getByTestId('brok-follow-up-form'))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })
    expect(
      await screen.findByTestId('completed-search-turn')
    ).toHaveTextContent('Brok answers with sources. [1]')
    expect(screen.getByTestId('brok-search-answer')).toHaveTextContent(
      'Brok cites each answer with source cards. [1]'
    )

    const persisted = JSON.parse(
      window.localStorage.getItem('brok:guest-chat:search_test') ?? '[]'
    )
    expect(persisted).toHaveLength(4)
    expect(persisted[2]).toMatchObject({
      id: 'search_test_user_2',
      role: 'user',
      parts: [{ type: 'text', text: 'How does Brok cite sources?' }]
    })
    expect(persisted[3]).toMatchObject({
      id: 'search_test_assistant_2',
      role: 'assistant',
      parts: [
        { type: 'text', text: 'Brok cites each answer with source cards. [1]' }
      ],
      metadata: {
        answer: {
          citationCount: 1
        }
      }
    })
  })
})
