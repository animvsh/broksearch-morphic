import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('keeps only essential composer controls visible while streaming', () => {
    const stop = vi.fn()
    renderPanel({
      status: 'streaming',
      stop,
      modelSelectorData: { models: [], hasAvailableModels: false }
    })

    expect(screen.getByRole('status')).toHaveTextContent('Composing answer')
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('button', { name: 'Quick' })).toBeInTheDocument()
    const stopButton = screen.getByRole('button', { name: 'Stop response' })
    expect(stopButton).toBeEnabled()
    fireEvent.click(stopButton)
    expect(stop).toHaveBeenCalledTimes(1)
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

  it('does not poll tasks until background work exists', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    renderPanel({ status: 'ready', input: 'research this' })

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('starts task polling after background work and stops after terminal states', async () => {
    vi.useFakeTimers()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          task: taskSummary({ status: 'running', title: 'Research React' })
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tasks: [
            taskSummary({
              status: 'succeeded',
              title: 'Research React',
              result: { answer: 'Done.' }
            })
          ]
        })
      })
    vi.stubGlobal('fetch', fetchMock)

    renderPanel({ status: 'ready', input: 'research React' })

    await act(async () => {
      fireEvent.click(screen.getByTitle('Run this as background deep research'))
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/tasks/deep-research')
    expect(String(fetchMock.mock.calls[1][0])).toContain('/api/tasks?')
    expect(screen.getByText(/deep research ready/i)).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(8000)
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

function taskSummary({
  status,
  title,
  result
}: {
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  title: string
  result?: { answer?: string }
}) {
  return {
    id: 'task-1',
    kind: 'deep-research',
    status,
    title,
    updatedAt: new Date().toISOString(),
    result
  }
}

function renderPanel({
  status,
  input = '',
  handleSubmit = vi.fn(),
  stop = vi.fn(),
  isGuest = false,
  modelSelectorData = { models: [], hasAvailableModels: true } as any
}: {
  status: 'ready' | 'submitted' | 'streaming'
  input?: string
  handleSubmit?: (event: React.FormEvent<HTMLFormElement>) => void
  stop?: () => void
  isGuest?: boolean
  modelSelectorData?: any
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
      stop={stop}
      append={vi.fn()}
      showScrollToBottomButton={false}
      scrollContainerRef={{ current: null }}
      uploadedFiles={[]}
      setUploadedFiles={vi.fn()}
      onFilesSelected={vi.fn()}
      onNewChat={vi.fn()}
      isGuest={isGuest}
      modelSelectorData={modelSelectorData}
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
