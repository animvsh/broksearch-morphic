import type { UIMessage } from 'ai'

import { getTextFromParts } from './message-utils'

const SIMPLE_CHAT_PATTERNS = [
  /^(hi|hello|hey|yo|sup|hiya|howdy)[!.?]*$/i,
  /^(ok|okay|cool|nice|great|thanks|thank you|ty)[!.?]*$/i,
  /^(test|testing|ping|pong|check|checking)[!.?]*$/i,
  /^(does this work|is this working|are you there|you there)[!.?]*$/i,
  /^(can u see this|can you see this|can you hear me|are we live)[!.?]*$/i
]

const URL_PATTERN = /\bhttps?:\/\/\S+|\bwww\.\S+/i

export function shouldUseQuickReplyForMessage(
  message: Pick<UIMessage, 'parts' | 'role'> | null | undefined
) {
  if (!message || message.role !== 'user') return false

  const text = getTextFromParts(message.parts).trim()
  if (!text || URL_PATTERN.test(text)) return false

  const hasNonTextContext = message.parts.some(part => {
    if (part.type === 'text') {
      return part.text.includes('<uploaded_file')
    }

    return part.type !== 'step-start'
  })

  if (hasNonTextContext) return false

  return SIMPLE_CHAT_PATTERNS.some(pattern => pattern.test(text))
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

  return createSimpleUtilityReply(getTextFromParts(message?.parts).trim())
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
