'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { Code2, Github } from 'lucide-react'
import { toast } from 'sonner'

import { ChatProvider } from '@/lib/contexts/chat-context'
import { generateId } from '@/lib/db/schema'
import { SHORTCUT_EVENTS } from '@/lib/keyboard-shortcuts'
import { stripSpecBlocks } from '@/lib/render/strip-spec-blocks'
import { UploadedFile } from '@/lib/types'
import type { UIMessage } from '@/lib/types/ai'
import {
  isDynamicToolPart,
  isToolCallPart,
  isToolTypePart
} from '@/lib/types/dynamic-tools'
import type { ModelSelectorData } from '@/lib/types/model-selector'
import { cn } from '@/lib/utils'
import { safeCopyTextToClipboard } from '@/lib/utils/copy-to-clipboard'
import { stripThinkingBlocks } from '@/lib/utils/strip-thinking-blocks'

import { useFileDropzone } from '@/hooks/use-file-dropzone'

import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './ui/dialog'
import { ChatMessages } from './chat-messages'
import { ChatPanel } from './chat-panel'
import { DragOverlay } from './drag-overlay'
import { ErrorModal } from './error-modal'

// Define section structure
interface ChatSection {
  id: string // User message ID
  userMessage: UIMessage
  assistantMessages: UIMessage[]
}

function hasCodingIntent(value: string) {
  const text = value.toLowerCase()
  return [
    /\bbuild\b/,
    /\bcode\b/,
    /\bdo\s*code\b/,
    /\bdocode\b/,
    /\bbrok\s*code\b/,
    /\bimplement\b/,
    /\bship\b/,
    /\bdeploy\b/,
    /\bdebug\b/,
    /\bsecurity\s+scan\b/,
    /\bvulnerability\s+scan\b/,
    /\bdeepsec\b/,
    /\/securityscan\b/,
    /\brefactor\b/,
    /\bfix (the|this|a)?\s*(bug|error|issue|ui|api|route|page|component|app|site|website)?/,
    /\b(add|make|create)\b.*\b(component|route|endpoint|api|app|site|website|page|feature|button|sidebar|modal|dashboard|landing page)\b/,
    /\b(github|pull request|pr|repo|repository|worktree)\b/
  ].some(pattern => pattern.test(text))
}

export function Chat({
  id: providedId,
  savedMessages = [],
  query,
  isGuest = false,
  isCloudDeployment = false,
  modelSelectorData
}: {
  id?: string
  savedMessages?: UIMessage[]
  query?: string
  isGuest?: boolean
  isCloudDeployment?: boolean
  modelSelectorData?: ModelSelectorData
}) {
  const router = useRouter()

  // Generate a stable chatId on the client side
  // - If providedId exists (e.g., /search/[id]), use it for existing chats
  // - Otherwise, generate a new ID (e.g., / homepage for new chats)
  const [chatId, setChatId] = useState(() => providedId || generateId())

  // Callback to reset chat state when user clicks "New" button
  const handleNewChat = () => {
    const newId = generateId()
    setChatId(newId)
    // Clear other chat-related state that persists due to Next.js 16 component caching
    setInput('')
    setUploadedFiles([])
    setErrorModal({
      open: false,
      type: 'general',
      message: ''
    })
  }

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [input, setInput] = useState('')
  const [pendingCodingPrompt, setPendingCodingPrompt] = useState<string | null>(
    null
  )
  const [errorModal, setErrorModal] = useState<{
    open: boolean
    type: 'rate-limit' | 'auth' | 'forbidden' | 'general'
    message: string
    details?: string
  }>({
    open: false,
    type: 'general',
    message: ''
  })

  const {
    messages,
    status,
    setMessages,
    stop,
    sendMessage,
    regenerate,
    addToolResult,
    error
  } = useChat({
    id: chatId, // use the client-generated or provided chatId
    transport: new DefaultChatTransport({
      api: '/api/chat',
      prepareSendMessagesRequest: ({ messages, trigger, messageId }) => {
        // Simplify by passing AI SDK's default trigger values directly
        const lastMessage = messages[messages.length - 1]
        const messageToRegenerate =
          trigger === 'regenerate-message'
            ? messages.find(m => m.id === messageId)
            : undefined

        return {
          body: {
            trigger, // Use AI SDK's default trigger value directly
            chatId: chatId,
            messageId,
            ...(isGuest ? { messages } : {}),
            message:
              trigger === 'regenerate-message' &&
              messageToRegenerate?.role === 'user'
                ? messageToRegenerate
                : trigger === 'submit-message'
                  ? lastMessage
                  : undefined,
            isNewChat:
              trigger === 'submit-message' &&
              messages.length === 1 &&
              savedMessages.length === 0
          }
        }
      }
    }),
    messages: savedMessages,
    onFinish: () => {
      window.dispatchEvent(new CustomEvent('chat-history-updated'))
    },
    onError: error => {
      // Handle rate limiting errors from Vercel WAF
      // Check for status codes in error message or specific rate limit indicators
      const errorMessage = error.message?.toLowerCase() || ''
      const isRateLimit =
        error.message?.includes('429') ||
        errorMessage.includes('rate limit') ||
        errorMessage.includes('too many requests') ||
        errorMessage.includes('daily limit')

      // Check for authentication errors
      const isAuthError =
        error.message?.includes('401') ||
        errorMessage.includes('unauthorized') ||
        errorMessage.includes('authentication required') ||
        errorMessage.includes('sign in to continue')

      if (isRateLimit) {
        // Try to parse JSON error response. The body may include `mode`
        // (e.g. "adaptive") so we can show context-specific guidance.
        let parsedError: {
          error?: string
          resetAt?: number
          remaining?: number
          mode?: string
        } = {}
        try {
          const jsonMatch = error.message?.match(/\{.*\}/)
          if (jsonMatch) {
            parsedError = JSON.parse(jsonMatch[0])
          }
        } catch {
          // Ignore parse errors
        }

        const userMessage =
          parsedError.error ||
          'You have reached your daily chat limit. Please try again tomorrow.'

        const details =
          parsedError.mode === 'deep'
            ? 'The limit resets at midnight UTC. You can continue in Quick Answer, Search, or Code mode.'
            : 'The limit resets at midnight UTC.'

        setErrorModal({
          open: true,
          type: 'rate-limit',
          message: userMessage,
          details
        })
      } else if (isAuthError) {
        // Try to parse JSON for context-specific auth prompts
        // (e.g. adaptive mode requires sign in).
        let parsedAuthError: { error?: string; authRequired?: boolean } = {}
        try {
          const jsonMatch = error.message?.match(/\{.*\}/)
          if (jsonMatch) parsedAuthError = JSON.parse(jsonMatch[0])
        } catch {
          // Ignore parse errors
        }

        setErrorModal({
          open: true,
          type: 'auth',
          message: parsedAuthError.error || error.message
        })
      } else if (
        error.message?.includes('403') ||
        errorMessage.includes('forbidden')
      ) {
        setErrorModal({
          open: true,
          type: 'forbidden',
          message: error.message
        })
      } else {
        // For general errors, still use toast for less intrusive notification
        toast.error('Brok could not complete the request. Please try again.')
      }
    },
    experimental_throttle: 32,
    generateId
  })

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
  }

  // Convert messages array to sections array
  const sections = useMemo<ChatSection[]>(() => {
    const result: ChatSection[] = []
    let currentSection: ChatSection | null = null

    for (const message of messages) {
      if (message.role === 'user') {
        // Start a new section when a user message is found
        if (currentSection) {
          result.push(currentSection)
        }
        currentSection = {
          id: message.id,
          userMessage: message,
          assistantMessages: []
        }
      } else if (currentSection && message.role === 'assistant') {
        // Add assistant message to the current section
        currentSection.assistantMessages.push(message)
      }
      // Ignore other role types like 'system' for now
    }

    // Add the last section if exists
    if (currentSection) {
      result.push(currentSection)
    }

    return result
  }, [messages])

  // Listen for copy message shortcut
  // Uses ref to avoid re-registering listener on every messages change.
  // Uses defaultPrevented + visibility check to prevent duplicate handling
  // when multiple Chat instances are mounted (Next.js component caching).
  const messagesRef = useRef(messages)
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    const handleCopyMessage = (e: Event) => {
      if (e.defaultPrevented) return
      // Only handle in the visible (active) Chat instance
      if (!scrollContainerRef.current?.offsetParent) return
      e.preventDefault()

      const assistantMessages = messagesRef.current.filter(
        m => m.role === 'assistant'
      )
      const lastAssistant = assistantMessages[assistantMessages.length - 1]
      if (!lastAssistant) {
        toast.info('No assistant message to copy')
        return
      }
      const text =
        lastAssistant.parts
          ?.filter(
            (p): p is { type: 'text'; text: string } => p.type === 'text'
          )
          .map(p => p.text)
          .join('\n') ?? ''

      if (text) {
        void safeCopyTextToClipboard(stripSpecBlocks(stripThinkingBlocks(text))).then(
          copied => {
            if (copied) {
              toast.success('Message copied to clipboard')
              return
            }
            toast.error('Failed to copy message')
          }
        )
      }
    }

    window.addEventListener(SHORTCUT_EVENTS.copyMessage, handleCopyMessage)
    return () =>
      window.removeEventListener(SHORTCUT_EVENTS.copyMessage, handleCopyMessage)
  }, [])

  // Dispatch custom event when messages change
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('messages-changed', {
        detail: { hasMessages: messages.length > 0 }
      })
    )
  }, [messages.length])

  // Detect if scroll container is at the bottom
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const updateIsAtBottom = () => {
      const { scrollTop, scrollHeight, clientHeight } = container
      const threshold = 50 // threshold in pixels
      setIsAtBottom(scrollHeight - scrollTop - clientHeight < threshold)
    }

    const handleScroll = () => {
      updateIsAtBottom()
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    const frame = requestAnimationFrame(updateIsAtBottom)

    return () => {
      cancelAnimationFrame(frame)
      container.removeEventListener('scroll', handleScroll)
    }
  }, [messages.length])

  // Check scroll position when messages change (during generation)
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const frame = requestAnimationFrame(() => {
      const { scrollTop, scrollHeight, clientHeight } = container
      const threshold = 50
      setIsAtBottom(scrollHeight - scrollTop - clientHeight < threshold)
    })

    return () => cancelAnimationFrame(frame)
  }, [messages])

  // Scroll to the section when a new user message is sent
  useEffect(() => {
    // Only scroll if this chat is currently visible in the URL
    const isCurrentChat =
      window.location.pathname === `/search/${chatId}` ||
      (window.location.pathname === '/' && sections.length > 0)

    if (isCurrentChat && sections.length > 0) {
      const lastMessage = messages[messages.length - 1]
      if (lastMessage && lastMessage.role === 'user') {
        // If the last message is from user, find the corresponding section
        const sectionId = lastMessage.id
        requestAnimationFrame(() => {
          const sectionElement = document.getElementById(`section-${sectionId}`)
          sectionElement?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        })
      }
    }
  }, [sections, messages, chatId])

  const handleUpdateAndReloadMessage = async (
    editedMessageId: string,
    newContentText: string
  ) => {
    if (!chatId) {
      toast.error('Chat ID is missing.')
      console.error('handleUpdateAndReloadMessage: chatId is undefined.')
      return
    }

    try {
      // Update the message locally with the same ID
      setMessages(prevMessages => {
        const messageIndex = prevMessages.findIndex(
          m => m.id === editedMessageId
        )
        if (messageIndex === -1) return prevMessages

        const updatedMessages = [...prevMessages]
        updatedMessages[messageIndex] = {
          ...updatedMessages[messageIndex],
          parts: [{ type: 'text', text: newContentText }]
        }

        return updatedMessages
      })

      // Regenerate from this message
      await regenerate({ messageId: editedMessageId })
    } catch (error) {
      console.error('Error during message edit and reload process:', error)
      toast.error(
        `Error processing edited message: ${(error as Error).message}`
      )
    }
  }

  const handleReloadFrom = async (reloadFromFollowerMessageId: string) => {
    if (!chatId) {
      toast.error('Chat ID is missing for reload.')
      return
    }

    try {
      // Use the SDK's regenerate function with the specific messageId
      await regenerate({ messageId: reloadFromFollowerMessageId })
    } catch (error) {
      console.error(
        `Error during reload from message ${reloadFromFollowerMessageId}:`,
        error
      )
      toast.error(`Failed to reload conversation: ${(error as Error).message}`)
    }
  }

  const submitToSearch = (promptOverride?: string) => {
    if (uploadedFiles.some(file => file.status === 'uploading')) {
      toast.info('Please wait for file processing to finish.')
      return
    }

    const uploaded = uploadedFiles.filter(f => f.status === 'uploaded')
    const promptText = promptOverride ?? input

    if (promptText.trim() || uploaded.length > 0) {
      const parts: any[] = []

      if (promptText.trim()) {
        parts.push({ type: 'text', text: promptText })
      }

      uploaded.forEach(file => {
        if (file.extractedText) {
          parts.push({
            type: 'text',
            text: [
              `File: ${file.name || file.file.name}`,
              'Use this file context when answering:',
              file.extractedText
            ].join('\n')
          })
        }
      })

      uploaded.forEach(file => {
        if (!file.url) return
        parts.push({
          type: 'file',
          url: file.url,
          filename: file.name || file.file.name,
          mediaType: file.file.type
        })
      })

      sendMessage({ role: 'user', parts })
      setInput('')
      setUploadedFiles([])

      // Push URL state immediately after sending message (for new chats)
      // Check if we're on the root path (new chat)
      if (!isGuest && window.location.pathname === '/') {
        window.history.pushState({}, '', `/search/${chatId}`)
      }
    }
  }

  const openBrokCodeCloud = (prompt: string) => {
    const url = new URL('/brokcode', window.location.origin)
    url.searchParams.set('prompt', prompt)
    url.searchParams.set('connect', 'github')
    url.searchParams.set('autostart', '1')
    setInput('')
    setUploadedFiles([])
    setPendingCodingPrompt(null)
    router.push(`${url.pathname}${url.search}`)
  }

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    const promptText = input.trim()
    if (promptText && hasCodingIntent(promptText)) {
      setPendingCodingPrompt(promptText)
      return
    }

    submitToSearch()
  }

  const {
    isDragging,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    processFiles
  } = useFileDropzone({
    uploadedFiles,
    setUploadedFiles,
    isGuest,
    chatId: chatId
  })

  return (
    <ChatProvider sendMessage={sendMessage}>
      <div
        className={cn(
          'relative flex h-full min-w-0 flex-1 flex-col',
          messages.length === 0 ? 'items-center justify-center' : ''
        )}
        data-testid="full-chat"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <ChatMessages
          sections={sections}
          status={status}
          chatId={chatId}
          isGuest={isGuest}
          addToolResult={({
            toolCallId,
            result
          }: {
            toolCallId: string
            result: any
          }) => {
            // Find the tool name from the message parts
            let toolName = 'unknown'

            // Optimize by breaking early once found
            outerLoop: for (const message of messages) {
              if (!message.parts) continue

              for (const part of message.parts) {
                if (isToolCallPart(part) && part.toolCallId === toolCallId) {
                  toolName = part.toolName
                  break outerLoop
                } else if (
                  isToolTypePart(part) &&
                  part.toolCallId === toolCallId
                ) {
                  toolName = part.type.substring(5) // Remove 'tool-' prefix
                  break outerLoop
                } else if (
                  isDynamicToolPart(part) &&
                  part.toolCallId === toolCallId
                ) {
                  toolName = part.toolName
                  break outerLoop
                }
              }
            }

            addToolResult({ tool: toolName, toolCallId, output: result })
          }}
          scrollContainerRef={scrollContainerRef}
          onUpdateMessage={handleUpdateAndReloadMessage}
          reload={handleReloadFrom}
          error={error}
        />
        <ChatPanel
          input={input}
          handleInputChange={handleInputChange}
          handleSubmit={onSubmit}
          status={status}
          messages={messages}
          setMessages={setMessages}
          stop={stop}
          query={query}
          append={(message: any) => {
            sendMessage(message)
          }}
          showScrollToBottomButton={!isAtBottom}
          uploadedFiles={uploadedFiles}
          setUploadedFiles={setUploadedFiles}
          onFilesSelected={processFiles}
          scrollContainerRef={scrollContainerRef}
          onNewChat={handleNewChat}
          isCloudDeployment={isCloudDeployment}
          modelSelectorData={modelSelectorData}
          sections={sections}
        />
        <DragOverlay visible={isDragging} />
        <ErrorModal
          open={errorModal.open}
          onOpenChange={open => setErrorModal(prev => ({ ...prev, open }))}
          error={errorModal}
          onRetry={
            errorModal.type !== 'rate-limit'
              ? () => {
                  // Retry the last message if not rate limited
                  if (messages.length > 0) {
                    const lastUserMessage = messages
                      .filter(m => m.role === 'user')
                      .pop()
                    if (lastUserMessage) {
                      sendMessage(lastUserMessage)
                    }
                  }
                }
              : undefined
          }
          onAuthClose={() => {
            // Clear messages and navigate to root
            setMessages([])
            router.push('/')
          }}
        />
        <Dialog
          open={Boolean(pendingCodingPrompt)}
          onOpenChange={open => {
            if (!open) setPendingCodingPrompt(null)
          }}
        >
          <DialogContent className="rounded-md sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Code2 className="size-4" />
                Start Brok Code?
              </DialogTitle>
              <DialogDescription>
                This looks like a coding request. I will connect GitHub first,
                then hand it to the Brok Code coding agent in brokcode-cloud.
              </DialogDescription>
            </DialogHeader>

            {pendingCodingPrompt && (
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <p className="line-clamp-4 whitespace-pre-wrap">
                  {pendingCodingPrompt}
                </p>
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const prompt = pendingCodingPrompt
                  setPendingCodingPrompt(null)
                  if (prompt) submitToSearch(prompt)
                }}
              >
                Keep In Chat
              </Button>
              <Button
                type="button"
                className="gap-2"
                onClick={() => {
                  if (pendingCodingPrompt) openBrokCodeCloud(pendingCodingPrompt)
                }}
              >
                <Github className="size-4" />
                Connect GitHub + Start Brok Code
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ChatProvider>
  )
}
