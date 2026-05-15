import type { UIMessage } from 'ai'

import { getVisibleTextFromParts } from './message-utils'

const SIMPLE_CHAT_PATTERNS = [
  /^(hi|hello|hey|yo|sup|hiya|howdy)[!.?]*$/i,
  /^(ok|okay|cool|nice|great|thanks|thank you|ty)[!.?]*$/i,
  /^(test|testing|ping|pong|check|checking)[!.?]*$/i,
  /^(does this work|is this working|are you there|you there)[!.?]*$/i,
  /^(can u see this|can you see this|can you hear me|are we live)[!.?]*$/i
]

const URL_PATTERN = /\bhttps?:\/\/\S+|\bwww\.\S+/i
const QUESTION_LIKE_PATTERN =
  /\b(who|what|when|where|why|how|which|can|should|does|do|did|is|are|was|were)\b/i
const SEARCH_INTENT_PATTERN =
  /\b(search|look\s*up|find\s+(?:me\s+)?(?:sources|results|info|information|articles|news)|web|internet|sources?|latest|today|current|recent|who\s+is|what\s+is|what\s+(?:companies|company|startups?)|where\s+(?:is|else)|when\s+is|founder|founded|company|startup|news|price|stock|weather|score|benchmark|research|invest|investment|traction|funding|mentioned)\b/i

export function isSimpleUtilityText(text: string) {
  const normalized = text.trim()
  if (!normalized || URL_PATTERN.test(normalized)) return false

  return SIMPLE_CHAT_PATTERNS.some(pattern => pattern.test(normalized))
}

export function shouldForceSearchForText(text: string | null | undefined) {
  const normalized = (text ?? '').trim()
  if (!normalized) return false
  if (isSimpleUtilityText(normalized)) return false

  return (
    URL_PATTERN.test(normalized) ||
    SEARCH_INTENT_PATTERN.test(normalized) ||
    (normalized.includes('?') && QUESTION_LIKE_PATTERN.test(normalized)) ||
    /^(who|what|when|where|why|how|which)\b/i.test(normalized)
  )
}

export function hasUploadedFileContext(
  message: Pick<UIMessage, 'parts' | 'role'> | null | undefined
) {
  if (!message || message.role !== 'user') return false

  return message.parts.some(part => {
    if (part.type === 'text') {
      return part.text.includes('<uploaded_file')
    }

    return part.type === 'file'
  })
}

export function shouldForceInitialWebSearchForMessage(
  message: Pick<UIMessage, 'parts' | 'role'> | null | undefined
) {
  if (!message || message.role !== 'user') return false
  if (hasUploadedFileContext(message)) return false

  return shouldForceSearchForText(getVisibleTextFromParts(message.parts))
}

export function shouldUseQuickReplyForMessage(
  message: Pick<UIMessage, 'parts' | 'role'> | null | undefined
) {
  if (!message || message.role !== 'user') return false

  const text = getVisibleTextFromParts(message.parts)
  if (!text || URL_PATTERN.test(text)) return false

  const hasNonTextContext = message.parts.some(part => {
    if (part.type === 'step-start') return false
    if (part.type === 'text') return part.text.includes('<uploaded_file')
    return true
  })

  if (hasNonTextContext) return false

  return isSimpleUtilityText(text)
}

export function createSimpleUtilityReply(text: string) {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/[!.?]+$/g, '')

  if (
    normalized === 'test' ||
    normalized === 'testing' ||
    normalized === 'ping' ||
    normalized === 'check' ||
    normalized === 'checking' ||
    normalized === 'does this work' ||
    normalized === 'is this working'
  ) {
    return 'Yep, it works.'
  }

  if (
    normalized === 'can u see this' ||
    normalized === 'can you see this' ||
    normalized === 'can you hear me' ||
    normalized === 'are we live' ||
    normalized === 'are you there' ||
    normalized === 'you there'
  ) {
    return 'Yep, I can see this.'
  }

  if (
    normalized === 'thanks' ||
    normalized === 'thank you' ||
    normalized === 'ty'
  ) {
    return 'You got it.'
  }

  return 'Hey, I am here.'
}

export function getSimpleUtilityReplyForMessage(
  message: Pick<UIMessage, 'parts' | 'role'> | null | undefined
) {
  if (!shouldUseQuickReplyForMessage(message)) return null

  return createSimpleUtilityReply(getVisibleTextFromParts(message?.parts))
}

export function getLatestUserMessage(
  messages: UIMessage[] | undefined
): UIMessage | null {
  if (!messages) return null

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role === 'user') {
      return message
    }
  }

  return null
}
