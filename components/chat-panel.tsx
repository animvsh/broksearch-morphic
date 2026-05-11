'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Textarea from 'react-textarea-autosize'
import { useRouter } from 'next/navigation'

import { UseChatHelpers } from '@ai-sdk/react'
import { ArrowUp, ChevronDown, MessageCirclePlus, Square } from 'lucide-react'
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
  'Catching the wind',
  'Calling the right tools',
  'Writing the reply'
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
  modelSelectorData?: ModelSelectorData
  /** Chat sections for message navigation dots */
  sections?: { id: string; userMessage: UIMessage }[]
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
  modelSelectorData,
  sections = []
}: ChatPanelProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const isFirstRender = useRef(true)
  const [isComposing, setIsComposing] = useState(false) // Composition state
  const [enterDisabled, setEnterDisabled] = useState(false) // Disable Enter after composition ends
  const [isInputFocused, setIsInputFocused] = useState(false) // Track input focus
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
    firstDuration: 700,
    itemDuration: 900,
    idleDuration: 150,
    charInterval: 24,
    initialDelay: 80
  })

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
          : 'mx-auto flex w-full max-w-4xl flex-col px-4 pb-8 pt-32 sm:px-6 md:pt-40'
      )}
    >
      {uploadedFiles.length > 0 && (
        <UploadedFileList files={uploadedFiles} onRemove={handleFileRemove} />
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
            <div className="overflow-hidden rounded-xl border border-border/70 bg-card/88 px-3 py-2 shadow-[0_16px_38px_-30px_rgba(15,23,42,0.32)] backdrop-blur-sm">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <IconBlinkingLogo className="size-3.5" />
                <span className="inline-flex min-w-0 items-center gap-1">
                  {isToolInvocationInProgress()
                    ? 'Working through tools:'
                    : 'Thinking:'}
                  <span className="truncate font-medium text-foreground/80">
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
                <div className="h-full w-2/5 animate-[pulse_1.4s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-blue-500/50 via-teal-500 to-orange-500/70" />
              </div>
            </div>
          </div>
        )}

        <div
          className={cn(
            'relative flex w-full flex-col gap-2 overflow-hidden rounded-2xl border border-zinc-200 bg-white/94 shadow-[0_22px_60px_-44px_rgba(15,23,42,0.42)] backdrop-blur-xl transition-shadow',
            isInputFocused &&
              'ring-2 ring-violet-500/15 ring-offset-2 ring-offset-background/70'
          )}
        >
          <div
            className={cn(
              'pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent opacity-0 transition-opacity duration-200',
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
                : 'Ask Brok to search, build, draft, analyze, or explain...'
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
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 bg-zinc-50/60 p-2.5 md:p-3">
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
                  'size-8 rounded-lg shadow-[0_12px_24px_-18px_rgba(37,99,235,0.45)] md:size-10'
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
