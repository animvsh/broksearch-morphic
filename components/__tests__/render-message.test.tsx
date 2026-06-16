import React from 'react'

import { render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import type { UIMessage } from '@/lib/types/ai'

import { RenderMessage } from '../render-message'

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_NEW_SEARCH_SURFACE = 'true'
})

vi.mock('../answer-section', () => ({
  AnswerSection: ({ content }: { content: string }) => (
    <div data-testid="answer-section">{content}</div>
  )
}))

vi.mock('../research-process-section', () => ({
  __esModule: true,
  default: ({ parts }: { parts: Array<{ text?: string; type: string }> }) => (
    <div data-testid="research-process">
      {parts.map(part => part.text ?? part.type).join(',')}
    </div>
  )
}))

vi.mock('../dynamic-tool-display', () => ({
  DynamicToolDisplay: () => <div data-testid="dynamic-tool" />
}))

vi.mock('../user-file-section', () => ({
  UserFileSection: () => <div data-testid="user-file" />
}))

vi.mock('../user-text-section', () => ({
  UserTextSection: () => <div data-testid="user-text" />
}))

describe('RenderMessage', () => {
  test('ignores empty text parts so research process is not split early', () => {
    const message: UIMessage = {
      id: 'assistant-msg',
      role: 'assistant',
      parts: [
        { type: 'reasoning', text: 'First reasoning' } as any,
        {
          type: 'tool-search',
          toolCallId: 'tool-1',
          state: 'output-available',
          input: {},
          output: {}
        } as any,
        { type: 'text', text: '' } as any,
        { type: 'reasoning', text: 'Second reasoning' } as any,
        { type: 'text', text: 'Final answer' } as any
      ]
    } as UIMessage

    const { container } = render(
      <RenderMessage
        message={message}
        messageId={message.id}
        getIsOpen={() => true}
        onOpenChange={() => {}}
      />
    )

    const processSections = screen.getAllByTestId('research-process')
    expect(processSections).toHaveLength(1)
    expect(processSections[0]).toHaveTextContent('First reasoning')
    expect(processSections[0]).toHaveTextContent('Second reasoning')
    expect(processSections[0]).not.toHaveTextContent('Final answer')

    const answerSections = screen.getAllByTestId('answer-section')
    expect(answerSections).toHaveLength(1)
    expect(answerSections[0]).toHaveTextContent('Final answer')

    const order = Array.from(
      container.querySelectorAll(
        '[data-testid="research-process"], [data-testid="answer-section"]'
      )
    ).map(node => node.getAttribute('data-testid'))
    expect(order).toEqual(['research-process', 'answer-section'])
  })

  test('renders the source-heavy search answer only for the final text part', () => {
    const citationMaps = {
      'tool-search-1': {
        1: {
          title: 'Brok docs',
          url: 'https://docs.brok.ai/search',
          content: 'Search docs.'
        }
      }
    }
    const message: UIMessage = {
      id: 'assistant-msg',
      role: 'assistant',
      parts: [
        { type: 'text', text: 'Early cited chunk [1](#tool-search-1).' } as any,
        {
          type: 'tool-search',
          toolCallId: 'tool-search-1',
          state: 'output-available',
          input: {},
          output: {}
        } as any,
        { type: 'text', text: 'Final answer with citations.' } as any
      ]
    } as UIMessage

    render(
      <RenderMessage
        citationMaps={citationMaps}
        message={message}
        messageId={message.id}
        getIsOpen={() => true}
        onOpenChange={() => {}}
      />
    )

    expect(screen.getAllByTestId('search-answer-section')).toHaveLength(1)
    expect(screen.getByTestId('search-answer-section')).toHaveTextContent(
      'Final answer with citations.'
    )
    expect(screen.getByText(/Early cited chunk/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '1' })).toHaveAttribute(
      'href',
      'https://docs.brok.ai/search'
    )
    expect(screen.getAllByText('Sources')).toHaveLength(1)
  })
})
