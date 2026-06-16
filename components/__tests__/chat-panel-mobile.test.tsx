import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn()
  })
}))

vi.mock('@/lib/actions/chat', () => ({
  appendAssistantMessageToChat: vi.fn()
}))

vi.mock('@/lib/keyboard-shortcuts', () => ({
  SHORTCUT_EVENTS: {
    newChat: 'new-chat'
  }
}))

vi.mock('@/hooks/use-search-mode', () => ({
  useSearchMode: () => ({
    searchMode: 'quick',
    setSearchMode: vi.fn()
  })
}))

vi.mock('../artifact/artifact-context', () => ({
  useArtifact: () => ({
    setArtifact: vi.fn()
  })
}))

vi.mock('../file-upload-button', () => ({
  FileUploadButton: () => <button type="button">Upload files</button>
}))

vi.mock('../model-selector-client', () => ({
  ModelSelectorClient: () => <button type="button">Brok Fast</button>
}))

vi.mock('../search-mode-selector', () => ({
  SearchModeSelector: () => <button type="button">Quick</button>
}))

vi.mock('../message-navigation-dots', () => ({
  MessageNavigationDots: () => <div data-testid="message-navigation-dots" />
}))

vi.mock('../uploaded-file-list', () => ({
  UploadedFileList: () => <div data-testid="uploaded-file-list" />
}))

import { ChatPanel } from '../chat-panel'

describe('ChatPanel mobile loading controls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps only essential composer controls visible while streaming', () => {
    renderPanel({ status: 'streaming' })

    expect(screen.getByRole('status')).toHaveTextContent('Composing answer')
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('button', { name: 'Quick' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Stop response' })
    ).toBeInTheDocument()
    expect(screen.queryByText('Upload files')).not.toBeInTheDocument()
    expect(screen.queryByText('Brok Fast')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Start new chat' })
    ).not.toBeInTheDocument()
  })

  it('shows full controls when ready', () => {
    renderPanel({ status: 'ready' })

    expect(screen.getByText('Upload files')).toBeInTheDocument()
    expect(screen.getByText('Brok Fast')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Start new chat' })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
  })

  it('submits with Enter when ready', () => {
    const handleSubmit = vi.fn((event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
    })
    renderPanel({ status: 'ready', input: 'follow up', handleSubmit })

    fireEvent.keyDown(screen.getByRole('textbox'), {
      key: 'Enter',
      shiftKey: false
    })

    expect(handleSubmit).toHaveBeenCalled()
  })
})

function renderPanel({
  status,
  input = '',
  handleSubmit = vi.fn()
}: {
  status: 'ready' | 'submitted' | 'streaming'
  input?: string
  handleSubmit?: (event: React.FormEvent<HTMLFormElement>) => void
}) {
  return render(
    <ChatPanel
      input={input}
      handleInputChange={vi.fn()}
      handleSubmit={handleSubmit}
      status={status}
      messages={[
        {
          id: 'user-1',
          role: 'user',
          parts: [{ type: 'text', text: 'What is React?' }]
        }
      ]}
      setMessages={vi.fn()}
      chatId="chat-1"
      stop={vi.fn()}
      append={vi.fn()}
      showScrollToBottomButton={false}
      scrollContainerRef={{ current: null }}
      uploadedFiles={[]}
      setUploadedFiles={vi.fn()}
      onFilesSelected={vi.fn()}
      onNewChat={vi.fn()}
      isGuest
      modelSelectorData={{ models: [], hasAvailableModels: true } as any}
      sections={[
        {
          id: 'user-1',
          userMessage: {
            id: 'user-1',
            role: 'user',
            parts: [{ type: 'text', text: 'What is React?' }]
          }
        }
      ]}
    />
  )
}
