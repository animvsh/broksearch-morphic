import { createRef } from 'react'

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ChatMessages } from '@/components/chat-messages'

vi.mock('@/components/ui/animated-logo', () => ({
  AnimatedLogo: () => <div data-testid="animated-logo" />
}))

vi.mock('@/components/chat-footer-message', () => ({
  ChatFooterMessage: ({ isLoading }: { isLoading: boolean }) => (
    <div data-testid="chat-footer-message">{String(isLoading)}</div>
  )
}))

describe('ChatMessages loading state', () => {
  it('shows a central pending answer before assistant text arrives', () => {
    render(
      <ChatMessages
        sections={[
          {
            id: 'section-1',
            userMessage: {
              id: 'user-1',
              role: 'user',
              parts: [{ type: 'text', text: 'Compare Cursor vs Windsurf' }]
            },
            assistantMessages: []
          }
        ]}
        status="submitted"
        scrollContainerRef={createRef<HTMLDivElement>()}
      />
    )

    expect(screen.getByTestId('pending-answer')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Searching sources')
    expect(screen.getByTestId('pending-step-search')).toHaveTextContent(
      'Search'
    )
    expect(screen.getByText(/drafting the answer/i)).toBeInTheDocument()
  })

  it('hides the central pending answer once answer text is streaming', () => {
    render(
      <ChatMessages
        sections={[
          {
            id: 'section-1',
            userMessage: {
              id: 'user-1',
              role: 'user',
              parts: [{ type: 'text', text: 'Compare Cursor vs Windsurf' }]
            },
            assistantMessages: [
              {
                id: 'assistant-1',
                role: 'assistant',
                parts: [{ type: 'text', text: 'Cursor is strongest for...' }]
              }
            ]
          }
        ]}
        status="streaming"
        scrollContainerRef={createRef<HTMLDivElement>()}
      />
    )

    expect(screen.queryByTestId('pending-answer')).not.toBeInTheDocument()
    expect(screen.getByText('Cursor is strongest for...')).toBeInTheDocument()
  })

  it('scopes streaming progress to the latest active assistant answer', () => {
    render(
      <ChatMessages
        sections={[
          {
            id: 'section-1',
            userMessage: {
              id: 'user-1',
              role: 'user',
              parts: [{ type: 'text', text: 'First question' }]
            },
            assistantMessages: [
              {
                id: 'assistant-1',
                role: 'assistant',
                parts: [{ type: 'text', text: 'Historical answer.' }]
              }
            ]
          },
          {
            id: 'section-2',
            userMessage: {
              id: 'user-2',
              role: 'user',
              parts: [{ type: 'text', text: 'Follow up' }]
            },
            assistantMessages: [
              {
                id: 'assistant-2',
                role: 'assistant',
                parts: [{ type: 'text', text: 'Active draft answer.' }]
              }
            ]
          }
        ]}
        status="streaming"
        scrollContainerRef={createRef<HTMLDivElement>()}
      />
    )

    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent('Writing answer')
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
    expect(screen.queryByTestId('pending-answer')).not.toBeInTheDocument()
  })

  it('shows pending answer for optimistic URL-query submissions before transport starts', () => {
    render(
      <ChatMessages
        sections={[
          {
            id: 'section-1',
            userMessage: {
              id: 'user-1',
              role: 'user',
              parts: [{ type: 'text', text: 'jo' }]
            },
            assistantMessages: []
          }
        ]}
        status="ready"
        hasPendingSubmission
        scrollContainerRef={createRef<HTMLDivElement>()}
      />
    )

    expect(screen.getByTestId('pending-answer')).toBeInTheDocument()
  })
})
