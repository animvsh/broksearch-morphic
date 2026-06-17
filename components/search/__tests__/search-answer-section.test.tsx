import type { ComponentProps } from 'react'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  it('shows immediate progress and skeletons while an answer is starting', () => {
    renderAnswer({ status: 'submitted' })

    expect(screen.getByRole('status')).toHaveTextContent('Searching sources')
    expect(screen.getByTestId('source-skeleton-strip')).toBeInTheDocument()
    expect(screen.getByTestId('answer-skeleton')).toBeInTheDocument()
    expect(screen.getByText(/drafting the answer/i)).toBeInTheDocument()
  })

  it('keeps sources visible while the answer is still streaming', () => {
    renderAnswer({
      status: 'streaming',
      content: 'Draft answer',
      metadata: {
        answer: {
          sources: [
            source({
              title: 'Streaming source',
              url: 'https://streaming.example/report'
            })
          ]
        }
      }
    })

    expect(screen.getByRole('status')).toHaveTextContent('Writing answer')
    expect(
      screen.getByRole('button', { name: /verify source 1: streaming source/i })
    ).toBeInTheDocument()
  })

  it('places source chips before the answer for faster verification', () => {
    renderAnswer({
      content: 'Answer text.',
      metadata: {
        answer: {
          sources: [
            source({
              title: 'Primary source',
              url: 'https://primary.example/report'
            })
          ]
        }
      }
    })

    const sourceChip = screen.getByRole('button', {
      name: /verify source 1: primary source/i
    })
    const answer = screen.getByTestId('answer-section')

    expect(
      sourceChip.compareDocumentPosition(answer) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

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

  it('does not generate fallback follow-ups from leaked thinking text', () => {
    renderAnswer({
      content: '<think>The user asked about iOS 26 beta. I should search first.'
    })

    expect(screen.queryByTestId('answer-toolbar')).not.toBeInTheDocument()
    expect(screen.queryByTestId('markdown-message')).not.toBeInTheDocument()
    expect(
      screen.queryByTestId('follow-up-suggestions')
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/<think>/i)).not.toBeInTheDocument()
  })

  it('renders the public answer after a closed thinking block', () => {
    renderAnswer({
      content:
        '<think>The private planning stays hidden.</think>Public answer is here.'
    })

    expect(screen.getByTestId('markdown-message')).toHaveTextContent(
      'Public answer is here.'
    )
    expect(screen.getByTestId('follow-up-suggestions')).toHaveTextContent(
      'What would a skeptic say about: Public answer is here?'
    )
    expect(screen.queryByText(/private planning/i)).not.toBeInTheDocument()
  })

  it('labels completed answers without attached sources as model knowledge', () => {
    renderAnswer({ content: 'This answer has no attached source cards.' })

    expect(screen.getByTestId('knowledge-fallback-notice')).toHaveTextContent(
      'No web sources were attached'
    )
  })

  it('does not show the model-knowledge label when sources are attached', () => {
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

    expect(
      screen.queryByTestId('knowledge-fallback-notice')
    ).not.toBeInTheDocument()
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

  it('copies source links from expanded source cards', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    })

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
    fireEvent.click(
      screen.getByRole('button', {
        name: /copy source link: stored source/i
      })
    )

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('https://stored.example/report')
    })
    expect(
      await screen.findByRole('button', {
        name: /source link copied: stored source/i
      })
    ).toBeInTheDocument()
  })

  it('copies source links from the verifier side panel', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    })

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
    fireEvent.click(screen.getByRole('button', { name: 'Copy source link' }))

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('https://stored.example/report')
    })
    expect(
      await screen.findByRole('button', { name: 'Source link copied' })
    ).toBeInTheDocument()
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
