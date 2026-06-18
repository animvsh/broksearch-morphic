import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  searchAnswer: vi.fn()
}))

vi.mock('@/components/search', () => ({
  DEMO_ANSWER: 'Fusion demo answer [1].',
  DEMO_FOLLOW_UPS: [
    {
      id: 'fu-1',
      query:
        'Compare the leading private fusion companies and their approaches',
      kind: 'compare'
    }
  ],
  DEMO_SOURCES: [{ id: '1', title: 'Demo source', domain: 'example.com' }],
  SearchAnswer: (props: {
    query: string
    answer: string
    isStreaming?: boolean
    followUps?: Array<{ id: string; query: string }>
    onFollowUpSelect?: (followUp: { id: string; query: string }) => void
    onShare?: () => void
    onReadAloud?: () => void
    onRegenerate?: () => void
    onTranslate?: (lang: string) => void
  }) => {
    mocks.searchAnswer(props)

    return (
      <section data-testid="search-answer">
        <div data-testid="answer-query">{props.query}</div>
        <div data-testid="answer-body">{props.answer}</div>
        <div data-testid="streaming">{String(props.isStreaming)}</div>
        {props.followUps?.map(followUp => (
          <button
            key={followUp.id}
            type="button"
            onClick={() => props.onFollowUpSelect?.(followUp)}
          >
            {followUp.query}
          </button>
        ))}
        <button type="button" onClick={props.onShare}>
          Share
        </button>
        <button type="button" onClick={props.onReadAloud}>
          Read aloud
        </button>
        <button type="button" onClick={props.onRegenerate}>
          Regenerate
        </button>
        <button type="button" onClick={() => props.onTranslate?.('es')}>
          Translate Spanish
        </button>
      </section>
    )
  }
}))

import SearchDemoPage from './page'

describe('SearchDemoPage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.searchAnswer.mockClear()
  })

  afterEach(() => {
    act(() => {
      vi.runOnlyPendingTimers()
    })
    vi.useRealTimers()
  })

  it('lets visitors run a typed static demo search without auth', () => {
    render(<SearchDemoPage />)

    fireEvent.change(screen.getByLabelText('Demo search query'), {
      target: { value: 'Can Broksearch explain demo honesty?' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))

    expect(screen.getByTestId('answer-query')).toHaveTextContent(
      'Can Broksearch explain demo honesty?'
    )
    expect(screen.getByTestId('answer-body')).toHaveTextContent(
      'This is a static demo response'
    )
    expect(screen.getByText(/Preparing a static demo answer/i)).toBeVisible()

    act(() => {
      vi.advanceTimersByTime(900)
    })

    expect(
      screen.getByText(/Demo answer loaded from static content/i)
    ).toBeVisible()
  })

  it.each([
    [
      'Can Broksearch explain demo honesty?',
      'What sources would Brok need for "Can Broksearch explain demo honesty?"',
      'What sources would Brok need for "Can Broksearch explain demo honesty?"?'
    ],
    [
      'Explain the launch plan!',
      'What sources would Brok need for "Explain the launch plan!"',
      'What sources would Brok need for "Explain the launch plan!"?'
    ],
    [
      'Summarize market sizing.',
      'What sources would Brok need for "Summarize market sizing."',
      'What sources would Brok need for "Summarize market sizing."?'
    ],
    [
      'Map the competitive landscape',
      'What sources would Brok need for "Map the competitive landscape"?',
      'What sources would Brok need for "Map the competitive landscape"'
    ]
  ])(
    'formats fallback follow-up punctuation for %s',
    (query, expectedFollowUp, unexpectedFollowUp) => {
      render(<SearchDemoPage />)

      fireEvent.change(screen.getByLabelText('Demo search query'), {
        target: { value: query }
      })
      fireEvent.click(screen.getByRole('button', { name: 'Search' }))

      expect(
        screen.getByRole('button', { name: expectedFollowUp })
      ).toBeVisible()
      expect(
        screen.queryByRole('button', { name: unexpectedFollowUp })
      ).not.toBeInTheDocument()
    }
  )

  it('runs prompt chips and follow-ups through the answer state', () => {
    render(<SearchDemoPage />)

    fireEvent.click(screen.getByRole('button', { name: 'React internals' }))

    expect(screen.getByTestId('answer-query')).toHaveTextContent(
      'How does React Server Components actually work under the hood?'
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Compare React Server Components with traditional SSR'
      })
    )

    expect(screen.getByTestId('answer-query')).toHaveTextContent(
      'Compare React Server Components with traditional SSR'
    )
    expect(screen.getByTestId('answer-body')).toHaveTextContent(
      'This is a static demo response'
    )
  })

  it('uses inline status for toolbar actions instead of alerts', () => {
    render(<SearchDemoPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    expect(screen.getByText(/Share is disabled/i)).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Translate Spanish' }))
    expect(screen.getByText(/Translation to es is preview-only/i)).toBeVisible()
  })
})
