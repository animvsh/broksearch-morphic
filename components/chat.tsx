'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
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
import type { SearchMode } from '@/lib/types/search'
import { cn } from '@/lib/utils'
import { getCookie } from '@/lib/utils/cookies'
import { safeCopyTextToClipboard } from '@/lib/utils/copy-to-clipboard'
import { stripThinkingBlocks } from '@/lib/utils/strip-thinking-blocks'

import { useFileDropzone } from '@/hooks/use-file-dropzone'

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

function escapeUploadedFileAttribute(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function getMessageText(message: UIMessage) {
  return (
    message.parts
      ?.filter(
        (part): part is { type: 'text'; text: string } =>
          part.type === 'text' && typeof (part as any).text === 'string'
      )
      .map(part => part.text)
      .join('\n') ?? ''
  )
}

const CHAT_FETCH_RETRY_DELAY_MS = 250
const GUEST_CHAT_STORAGE_PREFIX = 'brok:guest-chat:'

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isTransientFetchError(error: unknown) {
  if (!(error instanceof Error)) return false

  const message = error.message.toLowerCase()
  return (
    error.name === 'TypeError' &&
    (message.includes('failed to fetch') ||
      message.includes('networkerror') ||
      message.includes('load failed'))
  )
}

function getGuestChatStorageKey(chatId: string) {
  return `${GUEST_CHAT_STORAGE_PREFIX}${chatId}`
}

function isRestorableGuestMessageList(value: unknown): value is UIMessage[] {
  return (
    Array.isArray(value) &&
    value.every(
      message =>
        message &&
        typeof message === 'object' &&
        typeof (message as { id?: unknown }).id === 'string' &&
        typeof (message as { role?: unknown }).role === 'string' &&
        Array.isArray((message as { parts?: unknown }).parts)
    )
  )
}

async function resilientChatFetch(
  input: RequestInfo | URL,
  init?: RequestInit
) {
  const retryInput = input instanceof Request ? input.clone() : input

  try {
    return await fetch(input, init)
  } catch (error) {
    if (init?.signal?.aborted || !isTransientFetchError(error)) {
      throw error
    }

    await wait(CHAT_FETCH_RETRY_DELAY_MS)
    return fetch(retryInput, init)
  }
}

export function Chat({
  id: providedId,
  savedMessages = [],
  query,
  initialQueryMessageId,
  initialSearchMode,
  isGuest = false,
  isCloudDeployment = false,
  modelSelectorData
}: {
  id?: string
  savedMessages?: UIMessage[]
  query?: string
  initialQueryMessageId?: string
  initialSearchMode?: SearchMode
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
    setPendingUserMessage(null)
    setInput('')
    setUploadedFiles([])
    setErrorModal({
      open: false,
      type: 'general',
      message: ''
    })
  }

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true)
  const submittedInitialQueryRef = useRef<string | null>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [input, setInput] = useState('')
  const [pendingUserMessage, setPendingUserMessage] =
    useState<UIMessage | null>(() => {
      const initialQuery = query?.trim()
      if (!initialQuery || savedMessages.length > 0) return null

      return {
        id: initialQueryMessageId ?? generateId(),
        role: 'user',
        parts: [{ type: 'text', text: initialQuery }]
      } as UIMessage
    })
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
      fetch: resilientChatFetch,
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
            mode: getCookie('searchMode') ?? initialSearchMode,
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
            ? 'The limit resets at midnight UTC. You can continue in Quick, Search, or Code mode.'
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
    experimental_throttle: 24,
    generateId
  })

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
  }

  useEffect(() => {
    if (!isGuest || !providedId || savedMessages.length > 0) return
    if (typeof window === 'undefined') return

    try {
      const raw = window.localStorage.getItem(getGuestChatStorageKey(chatId))
      if (!raw) return

      const restored = JSON.parse(raw)
      if (isRestorableGuestMessageList(restored) && restored.length > 0) {
        setMessages(restored)
      }
    } catch {
      window.localStorage.removeItem(getGuestChatStorageKey(chatId))
    }
  }, [chatId, isGuest, providedId, savedMessages.length, setMessages])

  useEffect(() => {
    if (!isGuest || messages.length === 0) return
    if (typeof window === 'undefined') return

    try {
      window.localStorage.setItem(
        getGuestChatStorageKey(chatId),
        JSON.stringify(messages)
      )
    } catch {
      // Storage can be unavailable in private browsing or low-disk states.
    }
  }, [chatId, isGuest, messages])

  useEffect(() => {
    if (!pendingUserMessage) return

    const pendingText = getMessageText(pendingUserMessage)
    const isCommitted = messages.some(
      message =>
        message.id === pendingUserMessage.id ||
        (message.role === 'user' &&
          pendingText.length > 0 &&
          getMessageText(message) === pendingText)
    )

    if (isCommitted) {
      setPendingUserMessage(null)
    }
  }, [messages, pendingUserMessage])

  const visibleMessages = useMemo(() => {
    if (!pendingUserMessage) return messages

    const pendingText = getMessageText(pendingUserMessage)
    const isAlreadyVisible = messages.some(
      message =>
        message.id === pendingUserMessage.id ||
        (message.role === 'user' &&
          pendingText.length > 0 &&
          getMessageText(message) === pendingText)
    )

    return isAlreadyVisible ? messages : [...messages, pendingUserMessage]
  }, [messages, pendingUserMessage])

  // Convert messages array to sections array
  const sections = useMemo<ChatSection[]>(() => {
    const result: ChatSection[] = []
    let currentSection: ChatSection | null = null

    for (const message of visibleMessages) {
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
  }, [visibleMessages])

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
        void safeCopyTextToClipboard(
          stripSpecBlocks(stripThinkingBlocks(text))
        ).then(copied => {
          if (copied) {
            toast.success('Message copied to clipboard')
            return
          }
          toast.error('Failed to copy message')
        })
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
        detail: { hasMessages: visibleMessages.length > 0 }
      })
    )
  }, [visibleMessages.length])

  // Detect if scroll container is at the bottom
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const updateIsAtBottom = () => {
      const { scrollTop, scrollHeight, clientHeight } = container
      const threshold = 50 // threshold in pixels
      const nextIsAtBottom = scrollHeight - scrollTop - clientHeight < threshold
      isAtBottomRef.current = nextIsAtBottom
      setIsAtBottom(nextIsAtBottom)
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
  }, [visibleMessages.length])

  // Check scroll position when messages change (during generation)
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const frame = requestAnimationFrame(() => {
      const { scrollTop, scrollHeight, clientHeight } = container
      const threshold = 50
      const nextIsAtBottom = scrollHeight - scrollTop - clientHeight < threshold
      isAtBottomRef.current = nextIsAtBottom
      setIsAtBottom(nextIsAtBottom)
    })

    return () => cancelAnimationFrame(frame)
  }, [visibleMessages])

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container || !isAtBottomRef.current) return

    const frame = requestAnimationFrame(() => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: status === 'streaming' ? 'auto' : 'smooth'
      })
    })

    return () => cancelAnimationFrame(frame)
  }, [visibleMessages, status])

  // Scroll to the section when a new user message is sent
  useEffect(() => {
    // Only scroll if this chat is currently visible in the URL
    const isCurrentChat =
      window.location.pathname === `/search/${chatId}` ||
      (window.location.pathname === '/' && sections.length > 0)

    if (isCurrentChat && sections.length > 0) {
      const lastMessage = visibleMessages[visibleMessages.length - 1]
      if (lastMessage && lastMessage.role === 'user') {
        // If the last message is from user, find the corresponding section
        const sectionId = lastMessage.id
        requestAnimationFrame(() => {
          const container = scrollContainerRef.current
          const sectionElement = document.getElementById(`section-${sectionId}`)
          if (!container || !sectionElement) return

          container.scrollTo({
            top: Math.max(sectionElement.offsetTop - 16, 0),
            behavior: 'auto'
          })
        })
      }
    }
  }, [sections, visibleMessages, chatId])

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
        const existingMessage = updatedMessages[messageIndex]
        const existingParts = Array.isArray(existingMessage.parts)
          ? existingMessage.parts
          : []
        const preservedContextParts = existingParts.filter(
          part =>
            (part as any)?.type === 'file' ||
            ((part as any)?.type === 'text' &&
              typeof (part as any).text === 'string' &&
              (part as any).text.includes('<uploaded_file'))
        )

        updatedMessages[messageIndex] = {
          ...existingMessage,
          parts: [
            ...(newContentText.trim()
              ? [{ type: 'text' as const, text: newContentText }]
              : []),
            ...preservedContextParts
          ]
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
          const filename = file.name || file.file.name
          const safeFilename = escapeUploadedFileAttribute(filename)
          parts.push({
            type: 'text',
            text:
              [
                `<uploaded_file name="${safeFilename}">`,
                'The user uploaded this file. Treat the extracted content below as primary context when answering questions about the file.',
                file.extractedText
              ].join('\n') + '\n</uploaded_file>'
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

      const isInitialQuerySubmit =
        promptOverride?.trim() === query?.trim() &&
        Boolean(initialQueryMessageId)
      const outgoingMessage = {
        id: isInitialQuerySubmit ? initialQueryMessageId! : generateId(),
        role: 'user',
        parts
      } as UIMessage

      setPendingUserMessage(outgoingMessage)
      setInput('')
      setUploadedFiles([])
      sendMessage(outgoingMessage)

      // Commit query-backed and root submissions away from /search?q=...
      // immediately, so a browser reload does not replay the prompt.
      if (
        window.location.pathname === '/' ||
        window.location.pathname === '/search'
      ) {
        window.history.replaceState({}, '', `/search/${chatId}`)
      }
    }
  }

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    submitToSearch()
  }

  useEffect(() => {
    const initialQuery = query?.trim()
    if (!initialQuery) return
    if (submittedInitialQueryRef.current === initialQuery) return

    const hasExistingQueryMessage = messages.some(
      message =>
        message.role === 'user' &&
        (message.id === initialQueryMessageId ||
          getMessageText(message).trim() === initialQuery)
    )

    if (hasExistingQueryMessage) {
      submittedInitialQueryRef.current = initialQuery
      setPendingUserMessage(null)
      return
    }

    submittedInitialQueryRef.current = initialQuery
    submitToSearch(initialQuery)
    // submitToSearch intentionally remains local to this component; including
    // it would resubmit whenever chat UI state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, initialQueryMessageId, messages])

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
    <ChatProvider
      sendMessage={message => {
        const promptText = message.parts
          .filter(
            (part): part is { type: 'text'; text: string } =>
              part.type === 'text' && typeof part.text === 'string'
          )
          .map(part => part.text)
          .join('\n')
        submitToSearch(promptText)
      }}
    >
      <div
        className={cn(
          'relative flex h-full min-w-0 flex-1 flex-col bg-background',
          visibleMessages.length === 0
            ? 'items-center justify-center pb-10'
            : ''
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
          hasPendingSubmission={Boolean(pendingUserMessage)}
          onFollowUpSubmit={(text: string) => submitToSearch(text)}
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
          messages={visibleMessages}
          setMessages={setMessages}
          chatId={chatId}
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
          initialSearchMode={initialSearchMode}
          isCloudDeployment={isCloudDeployment}
          isGuest={isGuest}
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
                  if (visibleMessages.length > 0) {
                    const lastUserMessage = visibleMessages
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
      </div>
    </ChatProvider>
  )
}
