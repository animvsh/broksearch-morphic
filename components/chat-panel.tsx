'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Textarea from 'react-textarea-autosize'
import { useRouter } from 'next/navigation'

import { UseChatHelpers } from '@ai-sdk/react'
import {
  ArrowRight,
  ArrowUp,
  ChevronDown,
  Code2,
  Mail,
  MessageCirclePlus,
  Paperclip,
  Presentation,
  Search,
  ShieldCheck,
  Sparkles,
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

const SUGGESTED_PROMPTS = [
  'Summarize the market and cite sources',
  'Build a Lovable-style app in Brok Code',
  'Draft a warm customer reply in BrokMail',
  'Turn this idea into a presentation'
]

const PLAYFUL_TAGLINES = [
  'Search, code, mail, and slides in one clean flow.',
  'Drop in files, ask clearly, and watch the work happen.',
  'Fast answers with real tools behind them.'
]

const LOADING_TAGLINES = [
  'Catching the wind',
  'Calling the right tools',
  'Writing the reply'
]

const WORKSPACE_ACTIONS = [
  {
    label: 'Research',
    description: 'Ask a question with live sources and file context.',
    prompt: 'Research this deeply and cite the strongest sources.',
    icon: Search,
    tone: 'blue'
  },
  {
    label: 'Brok Code',
    description: 'Build, debug, scan, or deploy with the coding agent.',
    prompt: 'Build this feature in Brok Code and show me the plan first.',
    icon: Code2,
    tone: 'violet'
  },
  {
    label: 'BrokMail',
    description: 'Search mail, summarize threads, and draft replies.',
    prompt: 'Draft a concise warm reply based on this email context.',
    icon: Mail,
    tone: 'emerald'
  },
  {
    label: 'Slides',
    description: 'Create a polished deck or presentation outline.',
    prompt: 'Turn this into a beautiful presentation with a clear story.',
    icon: Presentation,
    tone: 'orange'
  }
]

const LIVE_STEPS = [
  {
    title: 'Understands the request',
    detail: 'Routes search, code, mail, slides, and integrations automatically.'
  },
  {
    title: 'Shows the work live',
    detail: 'Tool calls, uploads, citations, and drafts appear as they happen.'
  },
  {
    title: 'Keeps risky actions gated',
    detail: 'Deploys, sends, and bulk changes wait for your approval.'
  }
]

const toneClassByName: Record<string, string> = {
  blue: 'bg-blue-50 text-blue-700 ring-blue-100',
  violet: 'bg-violet-50 text-violet-700 ring-violet-100',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  orange: 'bg-orange-50 text-orange-700 ring-orange-100'
}

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
  const { displayText: playfulTagline } = useTypewriterCycle(PLAYFUL_TAGLINES, {
    firstDuration: 1700,
    itemDuration: 2200,
    idleDuration: 300,
    charInterval: 18,
    initialDelay: 120
  })
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

  const handleSuggestedPrompt = (prompt: string) => {
    sendProgrammaticPrompt(prompt)
  }

  return (
    <div
      className={cn(
        'w-full group/form-container shrink-0',
        messages.length > 0
          ? 'sticky bottom-0 bg-transparent px-2 pb-2 md:pb-4'
          : 'home-workspace-shell mx-auto flex flex-col justify-start px-4 pb-7 pt-24 sm:px-6 md:px-10 md:pt-28'
      )}
    >
      {messages.length === 0 && (
        <div className="mx-auto mb-5 grid w-full max-w-6xl gap-5 lg:grid-cols-[minmax(0,1fr)_390px] lg:items-stretch">
          <section className="home-hero-panel flex min-h-[390px] flex-col justify-between p-5 sm:p-6">
            <div className="space-y-5">
              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-zinc-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-zinc-700 shadow-xs">
                <Sparkles className="size-3.5 text-violet-600" />
                Brok workspace
              </span>
              <h1 className="max-w-2xl text-balance text-4xl font-semibold leading-[1.04] tracking-normal text-zinc-950 sm:text-5xl lg:text-[3.65rem]">
                What should Brok help with today?
              </h1>
              <p className="max-w-xl text-base leading-7 text-zinc-500">
                <span>{playfulTagline}</span>
                <span className="typing-cursor" />
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {WORKSPACE_ACTIONS.map(action => {
                const Icon = action.icon
                return (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => handleSuggestedPrompt(action.prompt)}
                    className="home-action-card group text-left"
                  >
                    <span
                      className={cn(
                        'inline-flex size-9 items-center justify-center rounded-full ring-1',
                        toneClassByName[action.tone]
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-3">
                        <span className="font-semibold text-zinc-950">
                          {action.label}
                        </span>
                        <ArrowRight className="size-4 text-zinc-400 transition-transform group-hover:translate-x-0.5 group-hover:text-zinc-700" />
                      </span>
                      <span className="home-action-description mt-1 hidden text-sm leading-5 text-zinc-500 sm:block">
                        {action.description}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="home-preview-panel hidden flex-col justify-between p-5 lg:flex">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="brand-mark animate-logo-float flex size-11 items-center justify-center rounded-full">
                    <IconBlinkingLogo className="size-6" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-zinc-950">
                      Live agent flow
                    </p>
                    <p className="text-xs text-zinc-500">
                      Fast, visible, and approval-first
                    </p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-100">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  ready
                </span>
              </div>

              <div className="space-y-3">
                {LIVE_STEPS.map((step, index) => (
                  <div
                    key={step.title}
                    className="rounded-2xl border border-zinc-200 bg-white/82 p-3.5 shadow-[0_14px_32px_-28px_rgba(15,23,42,0.3)]"
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-zinc-950 text-xs font-semibold text-white">
                        {index + 1}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-zinc-950">
                          {step.title}
                        </p>
                        <p className="mt-1 text-sm leading-5 text-zinc-500">
                          {step.detail}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              <button
                type="button"
                onClick={() =>
                  handleSuggestedPrompt(
                    'I am dropping files in. Summarize them and tell me what matters.'
                  )
                }
                className="group flex items-center gap-3 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/80 p-3.5 text-left transition-all hover:border-violet-200 hover:bg-violet-50/45"
              >
                <span className="flex size-9 items-center justify-center rounded-full bg-white text-violet-700 shadow-xs">
                  <Paperclip className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-zinc-950">
                    Drop files anywhere
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-zinc-500">
                    PDFs, docs, images, and notes become chat context.
                  </span>
                </span>
                <ArrowRight className="size-4 text-zinc-400 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
          </section>
        </div>
      )}
      {messages.length === 0 && (
        <div className="mx-auto mb-4 flex w-full max-w-4xl flex-wrap items-center justify-center gap-2 text-xs text-zinc-500">
          {SUGGESTED_PROMPTS.slice(0, 2).map(prompt => (
            <button
              key={prompt}
              type="button"
              onClick={() => handleSuggestedPrompt(prompt)}
              className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white/72 px-3 py-1.5 font-medium text-zinc-600 shadow-xs transition-all hover:-translate-y-0.5 hover:bg-white hover:text-zinc-950"
            >
              <Sparkles className="size-3.5 text-violet-600" />
              {prompt}
            </button>
          ))}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white/72 px-3 py-1.5 shadow-xs">
            <ShieldCheck className="size-3.5 text-emerald-600" />
            approvals before risky actions
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white/72 px-3 py-1.5 shadow-xs">
            <Paperclip className="size-3.5 text-violet-600" />
            drag files into chat
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white/72 px-3 py-1.5 shadow-xs">
            <Search className="size-3.5 text-blue-600" />
            live search and tools
          </span>
        </div>
      )}
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
        className={cn(
          'max-w-full w-full mx-auto relative',
          messages.length > 0 ? 'md:max-w-3xl' : 'max-w-4xl'
        )}
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
