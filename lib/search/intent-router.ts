import type { UIMessage } from 'ai'

import {
  ConnectorAction,
  normalizeConnectorToolkit
} from '@/lib/integrations/toolkit-registry'
import type { SearchMode } from '@/lib/types/search'
import {
  hasUploadedFileContext,
  isSimpleUtilityText,
  shouldUseQuickSearchModeForMessage
} from '@/lib/utils/chat-routing'
import {
  getVisibleTextFromParts,
  stripUploadedFileContext
} from '@/lib/utils/message-utils'

export type BrokIntent =
  | 'utility'
  | 'conversation'
  | 'quick_search'
  | 'standard_search'
  | 'deep_research'
  | 'connector_action'

export type BrokIntentDecision = {
  intent: BrokIntent
  confidence: number
  reason: string
  normalizedQuery: string
  connector?: {
    toolkit: string
    action: ConnectorAction
    requiresApproval: boolean
  }
}

const DEEP_INTENT_PATTERN =
  /\b(deep research|full report|comprehensive|long[- ]form|with citations and analysis|research brief|multi[- ]source|exhaustive|thorough audit)\b/i
const STANDARD_INTENT_PATTERN =
  /\b(compare|comparison|best|pros and cons|evaluate|evaluation|tradeoff|trade-offs|benchmark|versus| vs |which is better|rank|ranking)\b/i
const QUICK_FACT_PATTERN =
  /\b(who is|who was|what is|what was|where is|where else|when is|latest|today|current|recent|news|price|stock|weather|score|funding|founded|founder|company|startup|mentioned)\b/i
const QUESTION_START_PATTERN =
  /^(who|what|when|where|why|how|which|is|are|was|were|does|do|did|can|should)\b/i
const CONNECTOR_ACTION_PATTERN =
  /\b(connect|create|make|build|draft|write|update|edit|delete|remove|send|schedule|add|open|publish|show|list|inspect|read|search|find|summarize)\b/i
const CONNECTOR_NOUN_PATTERN =
  /\b(gmail|email|mail|calendar|gcal|google calendar|docs|google docs|slides|google slides|deck|decks|presentation|presentations|meet|google meet|github|linear|slack)\b/i

const CONNECTOR_MATCHES: Array<{
  pattern: RegExp
  toolkit: string
}> = [
  { pattern: /\b(gmail|email|mail)\b/i, toolkit: 'gmail' },
  {
    pattern: /\b(calendar|gcal|google calendar)\b/i,
    toolkit: 'googlecalendar'
  },
  { pattern: /\b(docs|google docs|doc)\b/i, toolkit: 'googledocs' },
  {
    pattern:
      /\b(slides|google slides|deck|decks|presentation|presentations)\b/i,
    toolkit: 'googleslides'
  },
  { pattern: /\b(meet|google meet)\b/i, toolkit: 'googlemeet' },
  {
    pattern: /\b(github|repo|repository|pull request|pr)\b/i,
    toolkit: 'github'
  },
  { pattern: /\b(linear|ticket|issue)\b/i, toolkit: 'linear' },
  { pattern: /\b(slack|channel)\b/i, toolkit: 'slack' }
]

function normalizeText(message?: Pick<UIMessage, 'parts' | 'role'> | null) {
  if (!message || message.role !== 'user') return ''

  return stripUploadedFileContext(getVisibleTextFromParts(message.parts))
    .trim()
    .replace(/\s+/g, ' ')
}

function resolveConnectorAction(text: string): ConnectorAction {
  if (/\b(connect|enable|authorize|auth|oauth)\b/i.test(text)) return 'connect'
  if (/\b(send|email|message)\b/i.test(text)) return 'send'
  if (/\b(schedule|book|calendar|meeting)\b/i.test(text)) return 'schedule'
  if (/\b(delete|remove|archive)\b/i.test(text)) return 'delete'
  if (/\b(update|edit|change|modify)\b/i.test(text)) return 'update'
  if (/\b(read|search|find|summarize|list|show|inspect)\b/i.test(text))
    return 'read'
  return 'create'
}

function resolveConnectorToolkit(text: string) {
  return CONNECTOR_MATCHES.find(match => match.pattern.test(text))?.toolkit
}

export function classifyBrokIntent(
  message: Pick<UIMessage, 'parts' | 'role'> | null | undefined
): BrokIntentDecision {
  const normalizedQuery = normalizeText(message)

  if (!normalizedQuery) {
    return {
      intent: 'conversation',
      confidence: 0.4,
      reason: 'empty or non-user message',
      normalizedQuery
    }
  }

  if (isSimpleUtilityText(normalizedQuery)) {
    return {
      intent: 'utility',
      confidence: 0.98,
      reason: 'tiny utility message',
      normalizedQuery
    }
  }

  if (
    !hasUploadedFileContext(message) &&
    CONNECTOR_ACTION_PATTERN.test(normalizedQuery) &&
    CONNECTOR_NOUN_PATTERN.test(normalizedQuery)
  ) {
    const action = resolveConnectorAction(normalizedQuery)
    const toolkit = normalizeConnectorToolkit(
      resolveConnectorToolkit(normalizedQuery)
    )
    return {
      intent: 'connector_action',
      confidence: 0.88,
      reason: 'workspace connector action request',
      normalizedQuery,
      connector: {
        toolkit,
        action,
        requiresApproval: action !== 'connect' && action !== 'read'
      }
    }
  }

  if (DEEP_INTENT_PATTERN.test(normalizedQuery)) {
    return {
      intent: 'deep_research',
      confidence: 0.9,
      reason: 'explicit deep research language',
      normalizedQuery
    }
  }

  if (STANDARD_INTENT_PATTERN.test(normalizedQuery)) {
    return {
      intent: 'standard_search',
      confidence: 0.78,
      reason: 'comparison or evaluation query',
      normalizedQuery
    }
  }

  if (
    shouldUseQuickSearchModeForMessage(message) ||
    QUICK_FACT_PATTERN.test(normalizedQuery) ||
    QUESTION_START_PATTERN.test(normalizedQuery)
  ) {
    return {
      intent: 'quick_search',
      confidence: 0.82,
      reason: 'factual or current-information query',
      normalizedQuery
    }
  }

  return {
    intent: 'conversation',
    confidence: 0.55,
    reason: 'no web or connector trigger detected',
    normalizedQuery
  }
}

export function resolveSearchModeForIntent({
  intent,
  requestedSearchMode
}: {
  intent: BrokIntent
  requestedSearchMode: SearchMode
}): SearchMode {
  if (intent === 'utility' || intent === 'quick_search') return 'quick'
  if (intent === 'connector_action') return 'quick'
  if (intent === 'standard_search') return 'search'
  if (intent === 'deep_research') return 'deep'
  if (requestedSearchMode === 'code') return 'code'
  return requestedSearchMode
}
