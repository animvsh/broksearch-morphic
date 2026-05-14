'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Textarea from 'react-textarea-autosize'
import { useRouter } from 'next/navigation'

import { UseChatHelpers } from '@ai-sdk/react'
import {
  ArrowUp,
  ChevronDown,
  Clock3,
  MessageCirclePlus,
  Square
} from 'lucide-react'
import { toast } from 'sonner'

import { SHORTCUT_EVENTS } from '@/lib/keyboard-shortcuts'
import { UploadedFile } from '@/lib/types'
import type { UIDataTypes, UIMessage, UITools } from '@/lib/types/ai'
import type { ModelSelectorData } from '@/lib/types/model-selector'
import { cn } from '@/lib/utils'

import { useTypewriterCycle } from '@/hooks/use-typewriter-cycle'

import { useArtifact } from './artifact/artifact-context'
import { Button } from './ui/button'
import { IconBlinkingLogo } from './ui/icons'
import { FileUploadButton } from './file-upload-button'
import { MessageNavigationDots } from './message-navigation-dots'
import { ModelSelectorClient } from './model-selector-client'
import { SearchModeSelector } from './search-mode-selector'
import { UploadedFileList } from './uploaded-file-list'

const LOADING_TAGLINES = [
  'Reading the thread',
  'Checking tools',
  'Searching sources',
  'Composing answer',
  'Preparing next steps'
]

interface ChatPanelProps {
  input: string
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  status: UseChatHelpers<UIMessage<unknown, UIDataTypes, UITools>>['status']
  messages: UIMessage[]
  setMessages: (messages: UIMessage[]) => void
  query?: string
  stop: () => void
  append: (message: any) => void
  /** Whether to show the scroll to bottom button */
  showScrollToBottomButton: boolean
  /** Reference to the scroll container */
  scrollContainerRef: React.RefObject<HTMLDivElement>
  uploadedFiles: UploadedFile[]
  setUploadedFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>
  onFilesSelected: (files: File[]) => Promise<void> | void
  /** Callback to reset chatId when starting a new chat */
  onNewChat?: () => void
  /** Whether the deployment is cloud mode */
  isCloudDeployment?: boolean
  /** Whether the current chat is running without an authenticated user */
  isGuest?: boolean
  modelSelectorData?: ModelSelectorData
  /** Chat sections for message navigation dots */
  sections?: { id: string; userMessage: UIMessage }[]
}

type BackgroundTaskSummary = {
  id: string
  kind: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  title: string
  updatedAt: string
}

export function ChatPanel({
  input,
  handleInputChange,
  handleSubmit,
  status,
  messages,
  setMessages,
  query,
  stop,
  append,
  showScrollToBottomButton,
  uploadedFiles,
  setUploadedFiles,
  onFilesSelected,
  scrollContainerRef,
  onNewChat,
  isCloudDeployment = false,
  isGuest = false,
  modelSelectorData,
  sections = []
}: ChatPanelProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const isFirstRender = useRef(true)
  const [isComposing, setIsComposing] = useState(false) // Composition state
  const [enterDisabled, setEnterDisabled] = useState(false) // Disable Enter after composition ends
  const [isInputFocused, setIsInputFocused] = useState(false) // Track input focus
  const [recentTasks, setRecentTasks] = useState<BackgroundTaskSummary[]>([])
  const { close: closeArtifact } = useArtifact()
  const isLoading = status === 'submitted' || status === 'streaming'
  const hasUploadedFiles = uploadedFiles.some(
    file => file.status === 'uploaded'
  )
  const hasUploadingFiles = uploadedFiles.some(
    file => file.status === 'uploading'
  )
  const hasAvailableModels =
    isCloudDeployment || modelSelectorData?.hasAvailableModels !== false
  const { displayText: loadingTagline } = useTypewriterCycle(LOADING_TAGLINES, {
    firstDuration: 1200,
    itemDuration: 1300,
    idleDuration: 80,
    charInterval: 18,
    initialDelay: 60,
    erase: false
  })
  const activeTasks = recentTasks.filter(
    task => task.status === 'queued' || task.status === 'running'
  )

  const handleCompositionStart = () => setIsComposing(true)

  const handleCompositionEnd = () => {
    setIsComposing(false)
    setEnterDisabled(true)
    setTimeout(() => {
      setEnterDisabled(false)
    }, 300)
  }

  const handleNewChat = useCallback(() => {
    setMessages([])
    closeArtifact()
    // Reset focus state when clearing chat
    setIsInputFocused(false)
    inputRef.current?.blur()
    // Reset chatId in parent component
    onNewChat?.()
    router.push('/')
  }, [setMessages, closeArtifact, onNewChat, router])

  // Listen for keyboard shortcut events
  // Uses defaultPrevented to prevent duplicate handling
  // when multiple ChatPanel instances are mounted (Next.js component caching)
  const handleNewChatRef = useRef(handleNewChat)
  useEffect(() => {
    handleNewChatRef.current = handleNewChat
  }, [handleNewChat])

  useEffect(() => {
    const handleNewChatShortcut = (e: Event) => {
      if (e.defaultPrevented) return
      e.preventDefault()
      handleNewChatRef.current()
    }

    window.addEventListener(SHORTCUT_EVENTS.newChat, handleNewChatShortcut)
    return () => {
      window.removeEventListener(SHORTCUT_EVENTS.newChat, handleNewChatShortcut)
    }
  }, [])

  useEffect(() => {
    if (isGuest) return

    let cancelled = false

    const loadTasks = async () => {
      try {
        const response = await fetch('/api/tasks?limit=5', {
          cache: 'no-store'
        })
        if (!response.ok) return

        const payload = (await response.json()) as {
          tasks?: BackgroundTaskSummary[]
        }
        if (!cancelled) {
          setRecentTasks(payload.tasks ?? [])
        }
      } catch {
        // Task visibility is a resilience aid; never interrupt chat UX for it.
      }
    }

    void loadTasks()
    const interval = window.setInterval(loadTasks, isLoading ? 4000 : 10000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [isGuest, isLoading])

  const isToolInvocationInProgress = () => {
    if (!messages.length) return false

    const lastMessage = messages[messages.length - 1]
    if (lastMessage.role !== 'assistant' || !lastMessage.parts) return false

    const parts = lastMessage.parts
    const lastPart = parts[parts.length - 1]

    return (
      (lastPart?.type === 'tool-search' ||
        lastPart?.type === 'tool-fetch' ||
        lastPart?.type === 'tool-askQuestion' ||
        lastPart?.type === 'tool-composioIntegrations') &&
      ((lastPart as any)?.state === 'input-streaming' ||
        (lastPart as any)?.state === 'input-available')
    )
  }

  const sendProgrammaticPrompt = useCallback(
    (text: string) => {
      append({
        role: 'user',
        parts: [{ type: 'text', text }]
      })
    },
    [append]
  )

  // if query is not empty, submit the query
  useEffect(() => {
    if (isFirstRender.current && query && query.trim().length > 0) {
      sendProgrammaticPrompt(query)
      isFirstRender.current = false
    }
  }, [query, sendProgrammaticPrompt])

  const handleFileRemove = useCallback(
    (index: number) => {
      setUploadedFiles(prev => prev.filter((_, i) => i !== index))
    },
    [setUploadedFiles]
  )
  // Scroll to the bottom of the container
  const handleScrollToBottom = () => {
    const scrollContainer = scrollContainerRef.current
    if (scrollContainer) {
      scrollContainer.scrollTo({
        top: scrollContainer.scrollHeight,
        behavior: 'smooth'
      })
    }
  }

  return (
    <div
      className={cn(
        'w-full group/form-container shrink-0',
        messages.length > 0
          ? 'sticky bottom-0 bg-transparent px-2 pb-2 md:pb-4'
          : 'mx-auto flex w-full max-w-4xl flex-col px-4 pb-8 pt-24 sm:px-6 md:pt-32'
      )}
    >
      {uploadedFiles.length > 0 && (
        <UploadedFileList files={uploadedFiles} onRemove={handleFileRemove} />
      )}
      {messages.length === 0 && (
        <div className="mx-auto mb-4 grid w-full max-w-3xl grid-cols-1 gap-2 px-1 text-xs text-muted-foreground sm:grid-cols-3">
          <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-background/80 px-3 py-2 shadow-sm">
            <span className="brand-status-pulse" />
            <span className="truncate">Brok agent online</span>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/80 px-3 py-2 shadow-sm">
            Live search and reasoning
          </div>
          <div className="rounded-lg border border-border/70 bg-background/80 px-3 py-2 shadow-sm">
            Files, tools, and citations
          </div>
        </div>
      )}
      <form
        onSubmit={e => {
          if (!hasAvailableModels) {
            e.preventDefault()
            toast.error('No enabled model is available')
            return
          }
          handleSubmit(e)
          // Reset focus state after submission
          setIsInputFocused(false)
          inputRef.current?.blur()
        }}
        className={cn('relative mx-auto w-full max-w-full md:max-w-3xl')}
      >
        {/* Scroll to bottom button */}
        {messages.length > 0 && (
          <div
            className={cn(
              'transition-opacity duration-100',
              showScrollToBottomButton
                ? 'opacity-100'
                : 'pointer-events-none opacity-0'
            )}
          >
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="absolute -top-10 right-0 z-20 size-8 rounded-full shadow-md"
              onClick={handleScrollToBottom}
              title="Scroll to bottom"
            >
              <ChevronDown size={16} />
            </Button>
          </div>
        )}
        {/* Message navigation dots */}
        {sections.length > 0 && (
          <div
            className={cn(
              'transition-opacity duration-100',
              !showScrollToBottomButton && status === 'ready'
                ? 'opacity-100'
                : 'pointer-events-none opacity-0'
            )}
          >
            <MessageNavigationDots sections={sections} />
          </div>
        )}
        {messages.length > 0 && isLoading && (
          <div className="mx-auto mb-2 max-w-3xl px-1">
            <div className="overflow-hidden rounded-xl border border-border/75 bg-card/95 px-3 py-2 shadow-[0_16px_44px_-36px_rgba(15,23,42,0.45)] backdrop-blur">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <IconBlinkingLogo className="size-3.5" />
                <span className="inline-flex min-w-0 items-center gap-1">
                  {isToolInvocationInProgress()
                    ? 'Working through tools:'
                    : 'Thinking:'}
                  <span className="thinking-text truncate font-medium text-foreground/80">
                    {loadingTagline}
                  </span>
                  <span className="typing-dots" aria-hidden>
                    <span />
                    <span />
                    <span />
                  </span>
                </span>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted/70">
                <div className="h-full w-1/2 animate-[brok-progress_1.35s_ease-in-out_infinite] rounded-full bg-zinc-950/80 dark:bg-white/80" />
              </div>
            </div>
          </div>
        )}

        {messages.length > 0 && activeTasks.length > 0 && (
          <div className="mx-auto mb-2 max-w-3xl px-1">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white/95 px-3 py-2 text-xs text-zinc-600 shadow-sm backdrop-blur">
              <span className="inline-flex min-w-0 items-center gap-2">
                <Clock3 className="size-3.5 shrink-0" />
                <span className="truncate">
                  {activeTasks.length === 1
                    ? `${activeTasks[0].title} is still running`
                    : `${activeTasks.length} tasks are still running`}
                </span>
              </span>
              <span className="hidden shrink-0 text-zinc-400 sm:inline">
                safe to reconnect
              </span>
            </div>
          </div>
        )}

        <div
          className={cn(
            'relative flex w-full flex-col gap-2 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_18px_50px_-42px_rgba(15,23,42,0.35)] transition-all duration-150',
            isLoading &&
              'border-zinc-300 shadow-[0_22px_60px_-42px_rgba(15,23,42,0.5)]',
            isInputFocused &&
              'ring-2 ring-zinc-300 ring-offset-1 ring-offset-background'
          )}
        >
          <div
            className={cn(
              'pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-zinc-300 to-transparent opacity-0 transition-opacity duration-100',
              (isInputFocused || isLoading) && 'opacity-100'
            )}
          />
          <Textarea
            ref={inputRef}
            name="input"
            rows={2}
            maxRows={5}
            tabIndex={0}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            onFocus={() => setIsInputFocused(true)}
            onBlur={() => setIsInputFocused(false)}
            placeholder={
              messages.length > 0
                ? 'Reply, refine, or ask for the next step...'
                : 'Ask anything...'
            }
            spellCheck={false}
            value={input}
            disabled={isLoading || isToolInvocationInProgress()}
            className="min-h-14 w-full resize-none border-0 bg-transparent p-4 text-sm leading-6 placeholder:text-zinc-400 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 md:p-5"
            onChange={handleInputChange}
            onKeyDown={e => {
              if (
                e.key === 'Enter' &&
                !e.shiftKey &&
                !isComposing &&
                !enterDisabled
              ) {
                if (input.trim().length === 0 && !hasUploadedFiles) {
                  e.preventDefault()
                  return
                }
                if (hasUploadingFiles) {
                  e.preventDefault()
                  toast.info('Please wait for file processing to finish.')
                  return
                }
                e.preventDefault()
                const textarea = e.target as HTMLTextAreaElement
                textarea.form?.requestSubmit()
                // Reset focus state after Enter key submission
                setIsInputFocused(false)
                textarea.blur()
              }
            }}
          />

          {/* Bottom menu area */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 bg-zinc-50 p-2.5 md:p-3">
            <div className="flex items-center gap-2">
              <FileUploadButton
                onFileSelect={files => {
                  void onFilesSelected(files)
                }}
              />
              <SearchModeSelector />
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden text-[11px] text-muted-foreground md:inline">
                Shift+Enter for newline
              </span>
              {!isCloudDeployment && modelSelectorData && (
                <ModelSelectorClient data={modelSelectorData} />
              )}
              {messages.length > 0 && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleNewChat}
                  className="shrink-0 size-8 rounded-lg group md:size-10"
                  type="button"
                  disabled={isLoading}
                >
                  <MessageCirclePlus className="size-4 group-hover:rotate-12 transition-all" />
                </Button>
              )}
              <Button
                type={isLoading ? 'button' : 'submit'}
                size={'icon'}
                className={cn(
                  isLoading && 'animate-pulse',
                  'size-8 rounded-lg md:size-10'
                )}
                disabled={
                  (!isLoading &&
                    input.trim().length === 0 &&
                    !hasUploadedFiles) ||
                  hasUploadingFiles ||
                  !hasAvailableModels
                }
                onClick={isLoading ? stop : undefined}
                title={
                  hasAvailableModels
                    ? undefined
                    : 'No enabled model is available'
                }
              >
                {isLoading ? (
                  <Square className="size-4 md:size-5" />
                ) : (
                  <ArrowUp className="size-4 md:size-5" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}
