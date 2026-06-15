import type { ComponentProps } from 'react'

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { SearchResultItem } from '@/lib/types'

import { extractSources, SearchAnswerSection } from '../search-answer-section'

vi.mock('@/components/message', () => ({
  MarkdownMessage: ({ message }: { message: string }) => (
    <div data-testid="markdown-message">{message}</div>
  )
}))

vi.mock('@/components/search/answer-toolbar', () => ({
  AnswerToolbar: () => <div data-testid="answer-toolbar" />
}))

vi.mock('@/components/search/follow-up-suggestions', () => ({
  FollowUpSuggestions: ({
    followUps,
    onSelect
  }: {
    followUps: Array<{ id: string; query: string }>
    onSelect: (followUp: { id: string; query: string }) => void
  }) => (
    <div data-testid="follow-up-suggestions">
      {followUps.map(followUp => (
        <button
          key={followUp.id}
          type="button"
          onClick={() => onSelect(followUp)}
        >
          {followUp.query}
        </button>
      ))}
    </div>
  )
}))

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

describe('SearchAnswerSection actions', () => {
  it('hides toolbar and fallback follow-ups when answer actions are disabled', () => {
    renderAnswer({ content: 'Brok searches and cites sources.' }, false)

    expect(screen.queryByTestId('answer-toolbar')).not.toBeInTheDocument()
    expect(
      screen.queryByTestId('follow-up-suggestions')
    ).not.toBeInTheDocument()
  })

  it('shows fallback follow-ups when no generated follow-ups are present', () => {
    renderAnswer({ content: 'Brok searches and cites sources.' })

    expect(screen.getByTestId('answer-toolbar')).toBeInTheDocument()
    expect(screen.getByTestId('follow-up-suggestions')).toHaveTextContent(
      'Go deeper on the most surprising point'
    )
  })

  it('does not add generic follow-ups when the answer contains generated submitQuery follow-ups', () => {
    renderAnswer({
      content: `Answer text.

\`\`\`spec
{"op":"add","path":"/root","value":"main"}
{"op":"add","path":"/elements/main","value":{"type":"Stack","props":{"direction":"vertical"},"children":["q1"]}}
{"op":"add","path":"/elements/q1","value":{"type":"Button","props":{"text":"How does Brok pick sources?","variant":"link","icon":"arrow-right"},"on":{"press":{"action":"submitQuery","params":{"query":"How does Brok pick sources?"}}},"children":[]}}
\`\`\``
    })

    expect(screen.getByTestId('answer-toolbar')).toBeInTheDocument()
    expect(
      screen.queryByTestId('follow-up-suggestions')
    ).not.toBeInTheDocument()
  })

  it('renders durable metadata follow-ups when text has no generated follow-ups', () => {
    renderAnswer({
      content: 'Answer text.',
      metadata: {
        answer: {
          followUps: [
            {
              id: 'stored-fu-1',
              label: 'Stored follow-up',
              query: 'Stored follow-up'
            }
          ]
        }
      }
    })

    expect(screen.getByTestId('follow-up-suggestions')).toHaveTextContent(
      'Stored follow-up'
    )
  })

  it('submits durable metadata follow-ups directly when a submit handler is provided', () => {
    const onFollowUpSubmit = vi.fn()

    renderAnswer({
      content: 'Answer text.',
      onFollowUpSubmit,
      metadata: {
        answer: {
          followUps: [
            {
              id: 'stored-fu-1',
              label: 'Stored follow-up',
              query: 'Stored follow-up'
            }
          ]
        }
      }
    })

    fireEvent.click(screen.getByRole('button', { name: /stored follow-up/i }))

    expect(onFollowUpSubmit).toHaveBeenCalledWith('Stored follow-up')
  })

  it('uses durable metadata sources when citation maps are unavailable', () => {
    renderAnswer({
      content: 'Answer text.',
      metadata: {
        answer: {
          sources: [
            source({
              title: 'Stored source',
              url: 'https://stored.example/report'
            })
          ]
        }
      }
    })

    expect(screen.getByText('Sources')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /verify source 1: stored source/i })
    ).toBeInTheDocument()
  })

  it('opens source cards in the verifier side panel', () => {
    renderAnswer({
      content: 'Answer text.',
      metadata: {
        answer: {
          sources: [
            source({
              title: 'Stored source',
              url: 'https://stored.example/report'
            })
          ]
        }
      }
    })

    fireEvent.click(screen.getByRole('button', { name: /show all/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Stored source' }))

    expect(screen.getByText('Excerpt')).toBeInTheDocument()
    expect(screen.getByText('Verification')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /open original/i })
    ).toHaveAttribute('href', 'https://stored.example/report')
  })

  it('keeps source verification reachable from compact source controls', () => {
    renderAnswer({
      content: 'Answer text.',
      metadata: {
        answer: {
          sources: [
            source({
              title: 'Stored source',
              url: 'https://stored.example/report'
            })
          ]
        }
      }
    })

    fireEvent.click(
      screen.getByRole('button', { name: /verify source 1: stored source/i })
    )

    expect(screen.getByText('Verification')).toBeInTheDocument()
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

function renderAnswer(
  props: Partial<ComponentProps<typeof SearchAnswerSection>>,
  showActions = true
) {
  render(
    <SearchAnswerSection
      content=""
      isOpen={true}
      onOpenChange={() => {}}
      messageId="message-1"
      showActions={showActions}
      {...props}
    />
  )
}
