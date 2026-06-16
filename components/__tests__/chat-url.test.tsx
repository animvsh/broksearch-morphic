import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  useRouter: vi.fn(),
  useChat: vi.fn(),
  sendMessage: vi.fn(),
  generateId: vi.fn()
}))

vi.mock('next/navigation', () => ({
  useRouter: mocks.useRouter
}))

vi.mock('@ai-sdk/react', () => ({
  useChat: mocks.useChat
}))

vi.mock('ai', () => ({
  DefaultChatTransport: vi.fn()
}))

vi.mock('@/lib/db/schema', () => ({
  generateId: mocks.generateId
}))

vi.mock('@/lib/keyboard-shortcuts', () => ({
  SHORTCUT_EVENTS: {
    copyMessage: 'copy-message',
    newChat: 'new-chat'
  }
}))

vi.mock('@/hooks/use-file-dropzone', () => ({
  useFileDropzone: () => ({
    isDragging: false,
    handleDragOver: vi.fn(),
    handleDragLeave: vi.fn(),
    handleDrop: vi.fn(),
    processFiles: vi.fn()
  })
}))

vi.mock('@/components/chat-messages', () => ({
  ChatMessages: ({
    onFollowUpSubmit
  }: {
    onFollowUpSubmit?: (query: string) => void
  }) => (
    <div data-testid="chat-messages">
      <button
        type="button"
        onClick={() => onFollowUpSubmit?.('Compare the strongest sources')}
      >
        Follow up
      </button>
    </div>
  )
}))

vi.mock('@/components/chat-panel', () => ({
  ChatPanel: () => <div data-testid="chat-panel" />
}))

vi.mock('@/components/drag-overlay', () => ({
  DragOverlay: () => null
}))

vi.mock('@/components/error-modal', () => ({
  ErrorModal: () => null
}))

import { Chat } from '@/components/chat'

describe('Chat query-backed URL behavior', () => {
  const storage = new Map<string, string>()

  beforeEach(() => {
    vi.clearAllMocks()
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
    window.localStorage.clear()
    window.history.replaceState({}, '', '/search?q=react&mode=quick')
    mocks.useRouter.mockReturnValue({
      push: vi.fn(),
      refresh: vi.fn()
    })
    mocks.generateId
      .mockReturnValueOnce('chat-from-query')
      .mockReturnValue('message-id')
    mocks.useChat.mockReturnValue({
      messages: [],
      status: 'ready',
      setMessages: vi.fn(),
      stop: vi.fn(),
      sendMessage: mocks.sendMessage,
      regenerate: vi.fn(),
      addToolResult: vi.fn(),
      error: null
    })
  })

  it('replaces /search query URLs with the durable thread URL when auto-submitting', async () => {
    render(<Chat query="react" initialSearchMode="quick" />)

    await waitFor(() => {
      expect(mocks.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'user',
          parts: [{ type: 'text', text: 'react' }]
        })
      )
    })

    expect(window.location.pathname).toBe('/search/chat-from-query')
    expect(window.location.search).toBe('')
  })

  it('replaces guest /search query URLs with a durable local thread URL without replay params', async () => {
    render(<Chat query="react" initialSearchMode="quick" isGuest />)

    await waitFor(() => {
      expect(mocks.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'user',
          parts: [{ type: 'text', text: 'react' }]
        })
      )
    })

    expect(window.location.pathname).toBe('/search/chat-from-query')
    expect(window.location.search).toBe('')
  })

  it('persists guest messages locally for reloadable answer pages', async () => {
    mocks.useChat.mockReturnValue({
      messages: [
        {
          id: 'user-1',
          role: 'user',
          parts: [{ type: 'text', text: 'initial question' }]
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          parts: [{ type: 'text', text: 'initial answer' }]
        }
      ],
      status: 'ready',
      setMessages: vi.fn(),
      stop: vi.fn(),
      sendMessage: mocks.sendMessage,
      regenerate: vi.fn(),
      addToolResult: vi.fn(),
      error: null
    })

    render(<Chat id="search_local" isGuest />)

    await waitFor(() => {
      expect(
        JSON.parse(
          window.localStorage.getItem('brok:guest-chat:search_local') ?? '[]'
        )
      ).toHaveLength(2)
    })
  })

  it('restores guest answer pages from local storage', async () => {
    const setMessages = vi.fn()
    window.localStorage.setItem(
      'brok:guest-chat:search_local',
      JSON.stringify([
        {
          id: 'user-1',
          role: 'user',
          parts: [{ type: 'text', text: 'initial question' }]
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          parts: [{ type: 'text', text: 'initial answer' }]
        }
      ])
    )
    mocks.useChat.mockReturnValue({
      messages: [],
      status: 'ready',
      setMessages,
      stop: vi.fn(),
      sendMessage: mocks.sendMessage,
      regenerate: vi.fn(),
      addToolResult: vi.fn(),
      error: null
    })

    render(<Chat id="search_local" isGuest />)

    await waitFor(() => {
      expect(setMessages).toHaveBeenCalledWith([
        {
          id: 'user-1',
          role: 'user',
          parts: [{ type: 'text', text: 'initial question' }]
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          parts: [{ type: 'text', text: 'initial answer' }]
        }
      ])
    })
  })

  it('routes follow-up chips through the normal submit path', async () => {
    mocks.useChat.mockReturnValue({
      messages: [
        {
          id: 'user-1',
          role: 'user',
          parts: [{ type: 'text', text: 'initial question' }]
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          parts: [{ type: 'text', text: 'initial answer' }]
        }
      ],
      status: 'ready',
      setMessages: vi.fn(),
      stop: vi.fn(),
      sendMessage: mocks.sendMessage,
      regenerate: vi.fn(),
      addToolResult: vi.fn(),
      error: null
    })

    render(<Chat initialSearchMode="search" />)

    fireEvent.click(screen.getByRole('button', { name: 'Follow up' }))

    expect(mocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'user',
        parts: [{ type: 'text', text: 'Compare the strongest sources' }]
      })
    )
  })
})
