import React from 'react'

import type { ReasoningPart } from '@ai-sdk/provider-utils'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, Mock, test, vi } from 'vitest'

import type { ToolPart, UIMessage } from '@/lib/types/ai'

import { ResearchProcessSection } from '../research-process-section'

// Mock the child components
vi.mock('../reasoning-section', () => ({
  ReasoningSection: ({ content, isOpen, onOpenChange }: any) => (
    <div data-testid="reasoning-section">
      <button
        aria-label={isOpen ? 'Collapse' : 'Expand'}
        onClick={() => onOpenChange(!isOpen)}
      >
        {isOpen ? 'Close' : 'Open'} Reasoning
      </button>
      {isOpen && <div>{content.reasoning}</div>}
    </div>
  )
}))

vi.mock('../tool-section', () => ({
  ToolSection: ({ tool, isOpen, onOpenChange }: any) => (
    <div data-testid="tool-section">
      <button
        aria-label={isOpen ? 'Collapse' : 'Expand'}
        onClick={() => onOpenChange(!isOpen)}
      >
        {isOpen ? 'Close' : 'Open'} Tool
      </button>
      {isOpen && <div>{tool.type}</div>}
    </div>
  )
}))

describe('ResearchProcessSection', () => {
  const mockGetIsOpen = vi.fn()
  const mockOnOpenChange = vi.fn()
  const mockAddToolResult = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetIsOpen.mockReturnValue(false)
  })

  describe('Type Guards', () => {
    test('correctly identifies reasoning parts', () => {
      const reasoningPart: ReasoningPart = {
        type: 'reasoning',
        text: 'Test reasoning'
      }

      const message = {
        id: 'test-message',
        role: 'assistant' as const,
        parts: [reasoningPart]
      } as unknown as UIMessage

      render(
        <ResearchProcessSection
          message={message}
          messageId="test-1"
          getIsOpen={mockGetIsOpen}
          onOpenChange={mockOnOpenChange}
        />
      )

      expect(screen.getByTestId('reasoning-section')).toBeInTheDocument()
    })

    test('correctly identifies tool parts', () => {
      const toolPart: ToolPart = {
        type: 'tool-search',
        toolCallId: 'tool-1',
        input: {},
        state: 'output-available'
      }

      const message = {
        id: 'test-message',
        role: 'assistant' as const,
        parts: [toolPart as any]
      } as UIMessage

      render(
        <ResearchProcessSection
          message={message}
          messageId="test-2"
          getIsOpen={mockGetIsOpen}
          onOpenChange={mockOnOpenChange}
        />
      )

      expect(screen.getByTestId('tool-section')).toBeInTheDocument()
    })

    test('filters out empty reasoning parts', () => {
      const emptyReasoningPart: ReasoningPart = {
        type: 'reasoning',
        text: ''
      }

      const validReasoningPart: ReasoningPart = {
        type: 'reasoning',
        text: 'Valid reasoning'
      }

      const message = {
        id: 'test-message',
        role: 'assistant' as const,
        parts: [emptyReasoningPart, validReasoningPart]
      }

      render(
        <ResearchProcessSection
          message={message}
          messageId="test-3"
          getIsOpen={mockGetIsOpen}
          onOpenChange={mockOnOpenChange}
        />
      )

      // Should only render one reasoning section (the valid one)
      const reasoningSections = screen.getAllByTestId('reasoning-section')
      expect(reasoningSections).toHaveLength(1)
    })
  })

  describe('Segmentation Logic', () => {
    test('splits parts by text correctly', () => {
      const parts: any[] = [
        { type: 'reasoning', text: 'First reasoning' } as ReasoningPart,
        {
          type: 'tool-search',
          toolCallId: 'tool-1',
          input: {},
          state: 'output-available'
        } as ToolPart,
        { type: 'text', text: 'Text separator' },
        { type: 'reasoning', text: 'Second reasoning' } as ReasoningPart
      ]

      const message: UIMessage = {
        id: 'test-message',
        role: 'assistant',
        parts
      }

      render(
        <ResearchProcessSection
          message={message}
          messageId="test-4"
          getIsOpen={mockGetIsOpen}
          onOpenChange={mockOnOpenChange}
        />
      )

      // Should render 3 sections (2 reasoning + 1 tool, split by text)
      const allSections = [
        ...screen.getAllByTestId('reasoning-section'),
        ...screen.getAllByTestId('tool-section')
      ]
      expect(allSections).toHaveLength(3)
    })

    test('groups consecutive tool parts of same type', () => {
      const parts: any[] = [
        {
          type: 'tool-search',
          toolCallId: 'tool-1',
          input: {},
          state: 'output-available'
        } as ToolPart,
        {
          type: 'tool-search',
          toolCallId: 'tool-2',
          input: {},
          state: 'output-available'
        } as ToolPart,
        {
          type: 'tool-fetch',
          toolCallId: 'tool-3',
          input: {},
          state: 'output-available'
        } as ToolPart
      ]

      const message: UIMessage = {
        id: 'test-message',
        role: 'assistant',
        parts
      }

      render(
        <ResearchProcessSection
          message={message}
          messageId="test-5"
          getIsOpen={mockGetIsOpen}
          onOpenChange={mockOnOpenChange}
        />
      )

      const toolSections = screen.getAllByTestId('tool-section')
      expect(toolSections).toHaveLength(3)
    })
  })

  describe('Accordion Behavior', () => {
    test('handles accordion state for grouped sections', () => {
      const parts: any[] = [
        { type: 'reasoning', text: 'First' } as ReasoningPart,
        { type: 'reasoning', text: 'Second' } as ReasoningPart
      ]

      const message: UIMessage = {
        id: 'test-message',
        role: 'assistant',
        parts
      }

      const { rerender } = render(
        <ResearchProcessSection
          message={message}
          messageId="test-6"
          getIsOpen={mockGetIsOpen}
          onOpenChange={mockOnOpenChange}
        />
      )

      const buttons = screen.getAllByLabelText('Expand')

      // Click first button to open
      fireEvent.click(buttons[0])

      // Should call onOpenChange
      expect(mockOnOpenChange).toHaveBeenCalled()

      // Update mock to return true for the clicked item
      mockGetIsOpen.mockImplementation(id => id.includes('reasoning-0-0-0'))

      rerender(
        <ResearchProcessSection
          message={message}
          messageId="test-6"
          getIsOpen={mockGetIsOpen}
          onOpenChange={mockOnOpenChange}
        />
      )
    })

    test('handles single sections differently from grouped sections', () => {
      const singlePart = [
        { type: 'reasoning', text: 'Single reasoning' } as ReasoningPart
      ]

      const message = {
        id: 'test-message',
        role: 'assistant' as const,
        parts: singlePart
      }

      render(
        <ResearchProcessSection
          message={message}
          messageId="test-7"
          getIsOpen={mockGetIsOpen}
          onOpenChange={mockOnOpenChange}
        />
      )

      const button = screen.getByLabelText('Expand')
      fireEvent.click(button)

      // For single sections, should directly call onOpenChange
      expect(mockOnOpenChange).toHaveBeenCalledWith(
        expect.stringContaining('reasoning'),
        true
      )
    })
  })

  describe('Subsequent Content Detection', () => {
    test('detects subsequent content correctly', () => {
      const parts: any[] = [
        { type: 'reasoning', text: 'First' } as ReasoningPart,
        { type: 'text', text: 'Text' },
        { type: 'reasoning', text: 'Second' } as ReasoningPart
      ]

      const message: UIMessage = {
        id: 'test-message',
        role: 'assistant',
        parts
      }

      render(
        <ResearchProcessSection
          message={message}
          messageId="test-8"
          getIsOpen={mockGetIsOpen}
          onOpenChange={mockOnOpenChange}
        />
      )

      // The first reasoning should detect subsequent content (the text part)
      expect(mockGetIsOpen).toHaveBeenCalledWith(
        expect.stringContaining('reasoning'),
        'reasoning',
        true // hasSubsequentContent should be true
      )
    })
  })

  describe('Edge Cases', () => {
    test('returns null for empty segments', () => {
      const message = {
        id: 'test-message',
        role: 'assistant' as const,
        parts: []
      }

      const { container } = render(
        <ResearchProcessSection
          message={message}
          messageId="test-9"
          getIsOpen={mockGetIsOpen}
          onOpenChange={mockOnOpenChange}
        />
      )

      expect(container.firstChild).toBeNull()
    })

    test('handles parts override correctly', () => {
      const message = {
        id: 'test-message',
        role: 'assistant' as const,
        parts: [{ type: 'reasoning', text: 'Original' } as ReasoningPart]
      }

      const overrideParts = [
        { type: 'reasoning', text: 'Override' } as ReasoningPart
      ]

      // Mock getIsOpen to return true so content is visible
      mockGetIsOpen.mockReturnValue(true)

      render(
        <ResearchProcessSection
          message={message}
          messageId="test-10"
          getIsOpen={mockGetIsOpen}
          onOpenChange={mockOnOpenChange}
          parts={overrideParts}
        />
      )

      // Should use override parts
      expect(screen.getByTestId('reasoning-section')).toBeInTheDocument()
      // The content should show "Override" when open
      expect(screen.getByText('Override')).toBeInTheDocument()
    })

    test('ignores unknown part types', () => {
      const parts: any[] = [{ type: 'data-test', data: 'test' }]

      const message: UIMessage = {
        id: 'test-message',
        role: 'assistant',
        parts
      }

      const { container } = render(
        <ResearchProcessSection
          message={message}
          messageId="test-11"
          getIsOpen={mockGetIsOpen}
          onOpenChange={mockOnOpenChange}
        />
      )

      // Unknown part types render no meaningful content (wrapper may exist)
      expect(screen.queryByTestId('reasoning-section')).not.toBeInTheDocument()
      expect(screen.queryByTestId('tool-section')).not.toBeInTheDocument()
    })
  })

  describe('Props Handling', () => {
    test('passes status prop correctly', () => {
      const toolPart: ToolPart = {
        type: 'tool-search',
        toolCallId: 'tool-1',
        input: {},
        state: 'output-available'
      }

      const message = {
        id: 'test-message',
        role: 'assistant' as const,
        parts: [toolPart as any]
      } as UIMessage

      render(
        <ResearchProcessSection
          message={message}
          messageId="test-12"
          getIsOpen={mockGetIsOpen}
          onOpenChange={mockOnOpenChange}
          status="streaming"
        />
      )

      expect(screen.getByTestId('tool-section')).toBeInTheDocument()
    })

    test('passes addToolResult prop correctly', () => {
      const toolPart: ToolPart = {
        type: 'tool-search',
        toolCallId: 'tool-1',
        input: {},
        state: 'output-available'
      }

      const message = {
        id: 'test-message',
        role: 'assistant' as const,
        parts: [toolPart as any]
      } as UIMessage

      render(
        <ResearchProcessSection
          message={message}
          messageId="test-13"
          getIsOpen={mockGetIsOpen}
          onOpenChange={mockOnOpenChange}
          addToolResult={mockAddToolResult}
        />
      )

      expect(screen.getByTestId('tool-section')).toBeInTheDocument()
    })
  })

  describe('Research Progress Timeline', () => {
    test('shows active search progress without exposing reasoning text', () => {
      const parts: any[] = [
        { type: 'reasoning', text: 'private planning details' },
        {
          type: 'tool-search',
          toolCallId: 'tool-search-1',
          input: { query: 'university tutoring platforms' },
          output: {
            state: 'searching',
            query: 'university tutoring platforms'
          },
          state: 'output-available'
        } as unknown as ToolPart<'search'>
      ]

      const message: UIMessage = {
        id: 'test-message',
        role: 'assistant',
        parts
      }

      render(
        <ResearchProcessSection
          message={message}
          messageId="test-progress-1"
          getIsOpen={mockGetIsOpen}
          onOpenChange={mockOnOpenChange}
          status="streaming"
        />
      )

      expect(screen.getByTestId('research-progress')).toBeInTheDocument()
      expect(screen.getByText('Understanding question')).toBeInTheDocument()
      expect(screen.getByText('Searching web')).toBeInTheDocument()
      expect(screen.getByText('Reading sources')).toBeInTheDocument()
      expect(
        screen.queryByText('private planning details')
      ).not.toBeInTheDocument()
    })

    test('summarizes completed source and follow-up progress', () => {
      const parts: any[] = [
        {
          type: 'tool-search',
          toolCallId: 'tool-search-1',
          input: { query: 'student research tools' },
          output: {
            state: 'complete',
            query: 'student research tools',
            results: [
              {
                title: 'Source 1',
                url: 'https://example.com/1',
                content: 'One'
              },
              {
                title: 'Source 2',
                url: 'https://example.com/2',
                content: 'Two'
              }
            ],
            images: [],
            videos: []
          },
          state: 'output-available'
        } as unknown as ToolPart<'search'>,
        {
          type: 'text',
          text: 'Answer with citation [1](#tool-search-1).\n\n```spec\n{"op":"add","path":"/root","value":{"type":"Container","props":{},"children":[]}}\n```'
        }
      ]

      const message: UIMessage = {
        id: 'test-message',
        role: 'assistant',
        parts
      }

      render(
        <ResearchProcessSection
          message={message}
          messageId="test-progress-2"
          getIsOpen={mockGetIsOpen}
          onOpenChange={mockOnOpenChange}
          status="ready"
        />
      )

      expect(screen.getByText('Found 2 sources')).toBeInTheDocument()
      expect(screen.getByText('Checking source quality')).toBeInTheDocument()
      expect(screen.getByText('Adding citations')).toBeInTheDocument()
      expect(screen.getByText('Generating follow-ups')).toBeInTheDocument()
    })
  })
})
