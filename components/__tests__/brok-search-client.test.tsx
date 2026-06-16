import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn()
  })
}))

vi.mock('../message', () => ({
  MarkdownMessage: ({
    citationMaps,
    onCitationOpen,
    message
  }: {
    citationMaps?: Record<string, Record<number, { title: string }>>
    onCitationOpen?: (citation: { title: string }) => void
    message: string
  }) => {
    const citation = citationMaps?.['brok-session-search']?.[1]
    return (
      <div
        data-citation-title={citation?.title ?? ''}
        data-testid="markdown-message"
      >
        {message}
        {citation && onCitationOpen && (
          <button
            type="button"
            onClick={() => onCitationOpen(citation)}
            data-testid="mock-citation-open"
          >
            Open citation
          </button>
        )}
      </div>
    )
  }
}))

vi.mock('../search/source-side-panel', () => ({
  SourceSidePanel: ({
    source
  }: {
    source: { title?: string } | null
    open: boolean
    onOpenChange: (open: boolean) => void
  }) =>
    source ? (
      <aside data-testid="source-side-panel">{source.title}</aside>
    ) : null
}))

vi.mock('../related-questions-panel', () => ({
  RelatedQuestionsPanel: ({
    followUps
  }: {
    followUps: Array<{ label?: string; query: string }>
  }) => (
    <aside data-testid="related-questions">
      {followUps.map(followUp => followUp.label ?? followUp.query).join(', ')}
    </aside>
  )
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

function deferredStreamResponse(
  events: Array<{ event: string; data: unknown }>
) {
  const encoder = new TextEncoder()
  let flush: (() => void) | undefined
  const response = new Response(
    new ReadableStream({
      start(controller) {
        flush = () => {
          const body = events
            .map(
              event =>
                `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`
            )
            .join('')
          controller.enqueue(encoder.encode(body))
          controller.close()
        }
      }
    }),
    {
      status: 200,
      headers: { 'content-type': 'text/event-stream' }
    }
  )

  return { response, flush: () => flush?.() }
}

function controllableStreamResponse() {
  const encoder = new TextEncoder()
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | undefined
  const response = new Response(
    new ReadableStream({
      start(controller) {
        controllerRef = controller
      }
    }),
    {
      status: 200,
      headers: { 'content-type': 'text/event-stream' }
    }
  )

  return {
    response,
    send(event: string, data: unknown) {
      controllerRef?.enqueue(
        encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
      )
    },
    close() {
      controllerRef?.close()
    }
  }
}

function getSessionSearchCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(
    ([url]) => String(url) === '/api/search/session'
  )
}

function getSessionPersistCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([url]) =>
    String(url).startsWith('/api/search/session/search_test/messages')
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
    const firstRequest = fetchMock.mock.calls[0] as unknown as [
      unknown,
      RequestInit
    ]
    expect(JSON.parse(String(firstRequest[1]?.body))).toEqual({
      query: 'What is Brok?',
      mode: 'search',
      stream: true
    })

    expect(window.location.pathname).toBe('/search/search_test')
    expect(window.location.search).toBe('')

    expect(await screen.findByTestId('brok-search-sources')).toHaveTextContent(
      'Brok docs'
    )
    expect(screen.getByTestId('markdown-message')).toHaveTextContent(
      'Brok answers with sources. [1](#brok-session-search:1)'
    )
    expect(screen.getByTestId('markdown-message')).toHaveAttribute(
      'data-citation-title',
      'Brok docs'
    )
    expect(screen.queryByTestId('brok-source-strip')).not.toBeInTheDocument()
    expect(
      screen
        .getByTestId('brok-search-answer')
        .compareDocumentPosition(screen.getByTestId('brok-search-sources')) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(screen.getByTestId('follow-up-chips')).toHaveTextContent(
      'How does Brok cite sources?'
    )
    expect(screen.getByTestId('related-questions')).toHaveTextContent(
      'How does Brok cite sources?'
    )

    fireEvent.click(screen.getByRole('button', { name: /\[1\] Brok docs/i }))
    expect(screen.getByTestId('source-side-panel')).toHaveTextContent(
      'Brok docs'
    )

    fireEvent.click(screen.getByTestId('mock-citation-open'))
    expect(screen.getByTestId('source-side-panel')).toHaveTextContent(
      'Brok docs'
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
    await waitFor(() => {
      expect(getSessionPersistCalls(fetchMock)).toHaveLength(1)
    })
    const serverPersistRequest = getSessionPersistCalls(fetchMock)[0] as [
      unknown,
      RequestInit
    ]
    expect(JSON.parse(String(serverPersistRequest[1]?.body))).toMatchObject({
      messages: [
        {
          id: 'search_test_user',
          role: 'user',
          parts: [{ type: 'text', text: 'What is Brok?' }]
        },
        {
          id: 'search_test_assistant',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Brok answers with sources. [1]' }]
        }
      ]
    })
  })

  it('restores a completed durable search instead of rerunning on reload', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    window.localStorage.setItem(
      'brok:guest-chat:search_test',
      JSON.stringify([
        {
          id: 'search_test_user',
          role: 'user',
          parts: [{ type: 'text', text: 'What is Brok?' }]
        },
        {
          id: 'search_test_assistant',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Stored answer with a source. [1]' }],
          metadata: {
            searchMode: 'search',
            modelId: 'brok-session-search',
            answer: {
              sources: [
                {
                  title: 'Stored Brok docs',
                  url: 'https://docs.example.com/stored',
                  content: 'Stored source.',
                  snippet: 'Stored source.',
                  publisher: 'docs.example.com',
                  retrievedAt: '2026-06-16T00:00:00.000Z'
                }
              ],
              citationCount: 1,
              followUps: [
                {
                  id: 'stored-follow-up-1',
                  label: 'What should I ask next?',
                  query: 'What should I ask next?'
                }
              ]
            }
          }
        }
      ])
    )

    render(
      <BrokSearchClient
        initialQuery="What is Brok?"
        initialMode="search"
        searchId="search_test"
      />
    )

    expect(await screen.findByTestId('brok-search-answer')).toHaveTextContent(
      'Stored answer with a source. [1](#brok-session-search:1)'
    )
    expect(screen.getByTestId('brok-search-sources')).toHaveTextContent(
      'Stored Brok docs'
    )
    expect(screen.getByTestId('follow-up-chips')).toHaveTextContent(
      'What should I ask next?'
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps guest search persistence local when server persistence is disabled', async () => {
    const fetchMock = vi.fn(async () =>
      streamResponse([
        {
          event: 'answer_delta',
          data: { delta: 'Guest answer stays local.' }
        },
        {
          event: 'done',
          data: {}
        }
      ])
    )
    vi.stubGlobal('fetch', fetchMock)

    render(
      <BrokSearchClient
        initialQuery="What is Brok?"
        initialMode="quick"
        searchId="search_test"
        persistToServer={false}
      />
    )

    expect(await screen.findByTestId('brok-search-answer')).toHaveTextContent(
      'Guest answer stays local.'
    )
    expect(getSessionSearchCalls(fetchMock)).toHaveLength(1)
    expect(getSessionPersistCalls(fetchMock)).toHaveLength(0)
    expect(
      window.localStorage.getItem('brok:guest-chat:search_test')
    ).toContain('Guest answer stays local.')
  })

  it('finishes the answer UI when a stream closes after content without done', async () => {
    const fetchMock = vi.fn(async () =>
      streamResponse([
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
          data: { delta: 'Brok answers even if the stream ends early. [1]' }
        }
      ])
    )
    vi.stubGlobal('fetch', fetchMock)

    render(
      <BrokSearchClient
        initialQuery="What is Brok?"
        initialMode="quick"
        searchId="search_test"
      />
    )

    expect(await screen.findByTestId('brok-search-answer')).toHaveTextContent(
      'Brok answers even if the stream ends early. [1](#brok-session-search:1)'
    )
    await waitFor(() => {
      expect(screen.queryByTestId('search-progress')).not.toBeInTheDocument()
    })
    expect(screen.getByLabelText('Ask a follow-up')).not.toBeDisabled()
    expect(screen.getByLabelText('Ask a follow-up')).toHaveAttribute(
      'placeholder',
      'Ask a follow-up...'
    )
    expect(screen.getByTestId('follow-up-chips')).toHaveTextContent('Go deeper')

    await waitFor(() => {
      expect(getSessionPersistCalls(fetchMock)).toHaveLength(1)
    })
    const persisted = JSON.parse(
      window.localStorage.getItem('brok:guest-chat:search_test') ?? '[]'
    )
    expect(persisted[1]).toMatchObject({
      role: 'assistant',
      parts: [
        {
          type: 'text',
          text: 'Brok answers even if the stream ends early. [1]'
        }
      ]
    })
  })

  it('restores a completed durable search from the rewritten search id route', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    window.history.replaceState({}, '', '/search/search_test')
    window.localStorage.setItem(
      'brok:guest-chat:search_test',
      JSON.stringify([
        {
          id: 'search_test_user',
          role: 'user',
          parts: [{ type: 'text', text: 'Reloaded question' }]
        },
        {
          id: 'search_test_assistant',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Reloaded answer. [1]' }],
          metadata: {
            answer: {
              sources: [
                {
                  title: 'Reloaded source',
                  url: 'https://docs.example.com/reloaded',
                  content: 'Reloaded source.'
                }
              ],
              followUps: []
            }
          }
        }
      ])
    )

    render(<BrokSearchClient searchId="search_test" />)

    expect(await screen.findByTestId('brok-search-question')).toHaveTextContent(
      'Reloaded question'
    )
    expect(screen.getByTestId('brok-search-answer')).toHaveTextContent(
      'Reloaded answer. [1](#brok-session-search:1)'
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows an answer skeleton immediately while the stream is pending', async () => {
    const deferred = deferredStreamResponse([
      {
        event: 'answer_delta',
        data: { delta: 'Brok answers with sources.' }
      },
      {
        event: 'done',
        data: {}
      }
    ])
    const fetchMock = vi.fn(async () => deferred.response)
    vi.stubGlobal('fetch', fetchMock)

    render(
      <BrokSearchClient
        initialQuery="What is Brok?"
        initialMode="quick"
        searchId="search_test"
      />
    )

    expect(await screen.findByTestId('brok-answer-loading-card')).toBeVisible()

    deferred.flush()

    expect(await screen.findByTestId('brok-search-answer')).toHaveTextContent(
      'Brok answers with sources.'
    )
  })

  it('shows resolved query planning chips while search is running', async () => {
    const stream = controllableStreamResponse()
    const fetchMock = vi.fn(async () => stream.response)
    vi.stubGlobal('fetch', fetchMock)

    const { unmount } = render(
      <BrokSearchClient
        initialQuery="React hooks"
        initialMode="quick"
        searchId="search_test"
      />
    )

    expect(await screen.findByTestId('search-progress')).toBeVisible()

    stream.send('query_resolved', {
      query: 'React hooks',
      resolved_query: 'React hooks',
      classification: {
        type: 'evergreen/explainer',
        needsSearch: true,
        reason: 'test'
      },
      search_queries: ['React hooks', 'React hooks official docs']
    })
    stream.send('search_started', {
      search_queries: ['React hooks', 'React hooks official docs']
    })

    await waitFor(() => {
      expect(screen.getByTestId('search-progress')).toHaveTextContent(
        'React hooks official docs'
      )
    })

    unmount()
    stream.close()
  })

  it('aborts the active search when the stop control is clicked', async () => {
    const stream = controllableStreamResponse()
    const fetchMock = vi.fn(async () => stream.response)
    vi.stubGlobal('fetch', fetchMock)

    render(
      <BrokSearchClient
        initialQuery="React hooks"
        initialMode="quick"
        searchId="search_test"
      />
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })

    const calls = fetchMock.mock.calls as unknown as Array<
      [unknown, RequestInit?]
    >
    const init = calls[0]?.[1] as RequestInit
    const signal = init.signal as AbortSignal
    expect(signal.aborted).toBe(false)

    await act(async () => {
      fireEvent.click(screen.getAllByLabelText('Stop search')[0])
    })

    expect(signal.aborted).toBe(true)
    await waitFor(() => {
      expect(screen.queryByTestId('search-progress')).not.toBeInTheDocument()
    })

    await act(async () => {
      stream.close()
    })
  })

  it('blocks follow-up submits while the current answer is still loading', async () => {
    const stream = controllableStreamResponse()
    const fetchMock = vi.fn(async () => stream.response)
    vi.stubGlobal('fetch', fetchMock)

    render(
      <BrokSearchClient
        initialQuery="React hooks"
        initialMode="quick"
        searchId="search_test"
      />
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    const followUpInput = screen.getByLabelText('Ask a follow-up')
    expect(followUpInput).toBeDisabled()
    expect(followUpInput).toHaveAttribute(
      'placeholder',
      'Waiting for this answer...'
    )

    fireEvent.submit(screen.getByTestId('brok-follow-up-form'))

    expect(fetchMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      stream.close()
    })
  })

  it('keeps the compact source strip only while the answer has not started', async () => {
    const stream = controllableStreamResponse()
    const fetchMock = vi.fn(async () => stream.response)
    vi.stubGlobal('fetch', fetchMock)

    render(
      <BrokSearchClient
        initialQuery="React hooks"
        initialMode="quick"
        searchId="search_test"
      />
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    await act(async () => {
      stream.send('source_found', {
        source: {
          id: 'src_1',
          title: 'Brok docs',
          url: 'https://docs.example.com/search',
          publisher: 'docs.example.com',
          snippet: 'Brok search docs.',
          retrievedAt: '2026-06-16T00:00:00.000Z',
          qualityScore: 91
        }
      })
    })

    expect(screen.getByTestId('brok-source-strip')).toHaveTextContent(
      'docs.example.com'
    )

    await act(async () => {
      stream.send('answer_delta', { delta: 'Answer started. [1]' })
      stream.send('done', {})
      stream.close()
    })

    expect(await screen.findByTestId('brok-search-answer')).toHaveTextContent(
      'Answer started. [1](#brok-session-search:1)'
    )
    expect(screen.queryByTestId('brok-source-strip')).not.toBeInTheDocument()
    expect(screen.getByTestId('brok-search-sources')).toHaveTextContent(
      'Brok docs'
    )
  })

  it('ignores late chunks from an older search stream', async () => {
    const firstStream = controllableStreamResponse()
    const secondStream = controllableStreamResponse()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(firstStream.response)
      .mockResolvedValueOnce(secondStream.response)
    vi.stubGlobal('fetch', fetchMock)

    render(
      <BrokSearchClient
        initialQuery="React hooks"
        initialMode="quick"
        searchId="search_test"
      />
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.change(screen.getByPlaceholderText('Ask anything...'), {
      target: { value: 'Vue composables' }
    })
    fireEvent.submit(
      screen.getByPlaceholderText('Ask anything...').closest('form')!
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    await act(async () => {
      firstStream.send('answer_delta', { delta: 'Old answer should not leak.' })
      secondStream.send('answer_delta', { delta: 'New answer wins.' })
      secondStream.send('done', {})
      secondStream.close()
      firstStream.close()
    })

    expect(await screen.findByTestId('brok-search-answer')).toHaveTextContent(
      'New answer wins.'
    )
    expect(screen.getByTestId('brok-search-answer')).not.toHaveTextContent(
      'Old answer should not leak.'
    )
  })

  it('keeps distinct sources when streamed source ids are missing', async () => {
    const fetchMock = vi.fn(async () =>
      streamResponse([
        {
          event: 'source_found',
          data: {
            source: {
              title: 'First Brok source',
              url: 'https://docs.example.com/one',
              publisher: 'docs.example.com',
              snippet: 'First source.',
              retrievedAt: '2026-06-16T00:00:00.000Z',
              qualityScore: 91
            }
          }
        },
        {
          event: 'source_found',
          data: {
            source: {
              title: 'Second Brok source',
              url: 'https://docs.example.com/two',
              publisher: 'docs.example.com',
              snippet: 'Second source.',
              retrievedAt: '2026-06-16T00:00:00.000Z',
              qualityScore: 88
            }
          }
        },
        {
          event: 'answer_delta',
          data: { delta: 'Brok cites both. [1] [2]' }
        },
        {
          event: 'done',
          data: {}
        }
      ])
    )
    vi.stubGlobal('fetch', fetchMock)

    render(
      <BrokSearchClient
        initialQuery="What is Brok?"
        initialMode="quick"
        searchId="search_test"
      />
    )

    expect(await screen.findByTestId('brok-search-source-0')).toHaveTextContent(
      'First Brok source'
    )
    expect(screen.getByTestId('brok-search-source-1')).toHaveTextContent(
      'Second Brok source'
    )
    expect(screen.getByTestId('brok-search-answer')).toHaveTextContent(
      'Brok cites both. [1](#brok-session-search:1) [2](#brok-session-search:2)'
    )
  })

  it('labels source-free answers as model knowledge', async () => {
    const fetchMock = vi.fn(async () =>
      streamResponse([
        {
          event: 'answer_delta',
          data: { delta: 'Brok can answer from model knowledge.' }
        },
        {
          event: 'done',
          data: {}
        }
      ])
    )
    vi.stubGlobal('fetch', fetchMock)

    render(
      <BrokSearchClient
        initialQuery="What is Brok?"
        initialMode="quick"
        searchId="search_test"
      />
    )

    expect(
      await screen.findByTestId('brok-no-sources-notice')
    ).toHaveTextContent('No web sources were attached')
    expect(screen.getByTestId('follow-up-chips')).toHaveTextContent('Go deeper')
  })

  it('suggests fallback follow-ups when the stream omits them', async () => {
    const fetchMock = vi.fn(async () =>
      streamResponse([
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
    )
    vi.stubGlobal('fetch', fetchMock)

    render(
      <BrokSearchClient
        initialQuery="What is Brok?"
        initialMode="quick"
        searchId="search_test"
      />
    )

    expect(await screen.findByTestId('brok-search-answer')).toHaveTextContent(
      'Brok answers with sources. [1](#brok-session-search:1)'
    )
    expect(screen.getByTestId('follow-up-chips')).toHaveTextContent('Go deeper')
    expect(screen.getByTestId('related-questions')).toHaveTextContent(
      'Go deeper'
    )
    expect(screen.getByTestId('follow-up-chips')).toHaveTextContent(
      'Compare tradeoffs'
    )
    expect(screen.getByTestId('related-questions')).toHaveTextContent(
      'Compare tradeoffs'
    )
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
      'Brok answers with sources. [1](#brok-session-search:1)'
    )

    fireEvent.change(screen.getByLabelText('Ask a follow-up'), {
      target: { value: 'How does Brok cite sources?' }
    })
    fireEvent.submit(screen.getByTestId('brok-follow-up-form'))

    await waitFor(() => {
      expect(getSessionSearchCalls(fetchMock)).toHaveLength(2)
    })
    const followUpRequest = getSessionSearchCalls(fetchMock)[1] as unknown as [
      unknown,
      RequestInit
    ]
    expect(JSON.parse(String(followUpRequest[1]?.body))).toEqual({
      query: 'How does Brok cite sources?',
      mode: 'search',
      stream: true,
      context: [
        {
          query: 'What is Brok?',
          answer: 'Brok answers with sources. [1]'
        }
      ]
    })
    expect(
      await screen.findByTestId('completed-search-turn')
    ).toHaveTextContent(
      'Brok answers with sources. [1](#brok-session-search:1)'
    )
    expect(screen.getByTestId('brok-search-answer')).toHaveTextContent(
      'Brok cites each answer with source cards. [1](#brok-session-search:1)'
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
