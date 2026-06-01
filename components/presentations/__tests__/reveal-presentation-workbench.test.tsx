import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { RevealPresentationWorkbench } from '../reveal-presentation-workbench'

vi.mock('reveal.js', () => ({
  default: class MockReveal {
    initialize = vi.fn(async () => undefined)
    destroy = vi.fn()
    sync = vi.fn()
    layout = vi.fn()
    slide = vi.fn()
  }
}))

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as Response
}

describe('RevealPresentationWorkbench', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('shows a clear local draft state before a deck is created', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ presentations: [] }))
    )

    render(<RevealPresentationWorkbench />)

    expect(
      await screen.findByText(/you are editing a local draft/i)
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /generate/i })).toBeDisabled()
    expect(screen.getByTestId('reveal-deck')).toHaveTextContent(
      'Brok Presentations'
    )

    fireEvent.click(screen.getByTestId('open-deck-list'))

    expect(screen.getByText(/no saved decks yet/i)).toBeInTheDocument()
  })

  it('creates a saved deck from the current draft', async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url === '/api/presentations' && !init?.method) {
          return jsonResponse({ presentations: [] })
        }
        if (url === '/api/presentations' && init?.method === 'POST') {
          return jsonResponse(
            {
              presentation: {
                id: 'deck-1',
                title: 'Quarterly Plan',
                description: null,
                status: 'draft',
                slideCount: 1,
                isPublic: false,
                shareId: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                sourceMarkdown: '# Quarterly Plan'
              }
            },
            201
          )
        }
        if (url === '/api/presentations/deck-1' && init?.method === 'PATCH') {
          return jsonResponse({ ok: true })
        }
        throw new Error(`Unexpected fetch: ${url}`)
      }
    )
    vi.stubGlobal('fetch', fetchMock)

    render(<RevealPresentationWorkbench />)

    fireEvent.change(await screen.findByLabelText(/deck title/i), {
      target: { value: 'Quarterly Plan' }
    })
    fireEvent.change(screen.getByLabelText(/presentation markdown source/i), {
      target: {
        value:
          '# Quarterly Plan\nKicker: Board update\nA tighter operating story.'
      }
    })
    fireEvent.click(screen.getByRole('button', { name: /create/i }))

    expect(await screen.findByText(/deck created/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^save$/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /generate/i })).toBeEnabled()

    const createCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input) === '/api/presentations' && init?.method === 'POST'
    )
    const saveCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input) === '/api/presentations/deck-1' &&
        init?.method === 'PATCH'
    )

    expect(createCall).toBeDefined()
    expect(saveCall).toBeDefined()
    expect(JSON.parse(String(createCall?.[1]?.body))).toMatchObject({
      title: 'Quarterly Plan'
    })
    expect(JSON.parse(String(saveCall?.[1]?.body))).toMatchObject({
      title: 'Quarterly Plan',
      sourceMarkdown:
        '# Quarterly Plan\nKicker: Board update\nA tighter operating story.'
    })
  })

  it('opens an existing deck and keeps preview navigation usable', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/presentations') {
        return jsonResponse({
          presentations: [
            {
              id: 'deck-2',
              title: 'Launch Story',
              description: null,
              status: 'draft',
              slideCount: 2,
              isPublic: true,
              shareId: 'share-2',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }
          ]
        })
      }
      if (url === '/api/presentations/deck-2') {
        return jsonResponse({
          presentation: {
            id: 'deck-2',
            title: 'Launch Story',
            description: null,
            status: 'draft',
            slideCount: 2,
            isPublic: true,
            shareId: 'share-2',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            sourceMarkdown:
              '# First Move\nStart here.\n\n---\n\n# Second Move\nThen land the point.'
          }
        })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<RevealPresentationWorkbench />)

    fireEvent.click(await screen.findByTestId('open-deck-list'))
    fireEvent.click(
      await screen.findByRole('button', { name: /launch story/i })
    )

    expect(await screen.findByDisplayValue(/# First Move/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /share/i })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: /next slide/i }))

    await waitFor(() => {
      expect(screen.getByText('2 / 2')).toBeInTheDocument()
    })
  })
})
