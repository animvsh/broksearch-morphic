import { createHash } from 'crypto'

import { loadChat } from '@/lib/actions/chat'
import { requireFeatureAccess } from '@/lib/auth/app-access'
import { isAnonymousAuthMode } from '@/lib/auth/get-current-user'
import {
  getCurrentUserIdForOptionalGuestSearch,
  isGuestSearchEnabled,
  isGuestSearchMode
} from '@/lib/auth/guest-search'
import { normalizeSearchMode } from '@/lib/config/search-modes'
import { getModelSelectorData } from '@/lib/model-selector/get-model-selector-data'
import type { UIMessage } from '@/lib/types/ai'
import type { SearchMode } from '@/lib/types/search'
import { generateUUID } from '@/lib/utils'
import {
  createSimpleUtilityReply,
  isSimpleUtilityText
} from '@/lib/utils/chat-routing'

import { BrokSearchClient } from '@/components/brok-search-client'
import { Chat } from '@/components/chat'
import { SearchLanding } from '@/components/search/search-landing'

export const maxDuration = 60

type SearchPageParams = {
  q?: string | string[]
  mode?: string | string[]
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function buildSearchRedirectPath(query: string, mode: SearchMode) {
  const params = new URLSearchParams()
  if (query) {
    params.set('q', query)
  }
  params.set('mode', mode)

  return `/search?${params.toString()}`
}

function getQueryBackedChatId(query: string, mode: SearchMode, userId: string) {
  const hash = createHash('sha256')
    .update(userId)
    .update('\0')
    .update(mode)
    .update('\0')
    .update(query)
    .digest('hex')
    .slice(0, 48)

  return `search_${hash}`
}

export default async function SearchPage(props: {
  searchParams: Promise<SearchPageParams>
}) {
  const searchParams = await props.searchParams
  const q = firstParam(searchParams.q)?.trim() ?? ''
  const mode = normalizeSearchMode(firstParam(searchParams.mode))
  const redirectTo = buildSearchRedirectPath(q, mode)
  const userId = await getCurrentUserIdForOptionalGuestSearch(mode)
  const isLocalAnonymousGuest =
    isAnonymousAuthMode() && isGuestSearchEnabled() && isGuestSearchMode(mode)
  const effectiveUserId = isLocalAnonymousGuest ? undefined : userId
  const isGuest = !effectiveUserId
  const canUseGuestSearch =
    isGuest && isGuestSearchEnabled() && isGuestSearchMode(mode)

  if (!canUseGuestSearch) {
    await requireFeatureAccess(redirectTo, 'search')
  }

  if (!q) {
    const isCloudDeployment = process.env.BROK_CLOUD_DEPLOYMENT === 'true'
    const modelSelectorData = await getModelSelectorData()

    return (
      <SearchLanding
        defaultMode={mode}
        isCloudDeployment={isCloudDeployment}
        hasModels={modelSelectorData?.hasAvailableModels !== false}
      />
    )
  }

  const id = getQueryBackedChatId(q, mode, effectiveUserId ?? 'guest')
  const existingChat = effectiveUserId
    ? await loadChat(id, effectiveUserId)
    : null
  const isCloudDeployment = process.env.BROK_CLOUD_DEPLOYMENT === 'true'
  const modelSelectorData = await getModelSelectorData()
  const simpleUtilityReply = isSimpleUtilityText(q)
    ? createSimpleUtilityReply(q)
    : null

  if (!existingChat?.messages.length && simpleUtilityReply === null) {
    return (
      <BrokSearchClient
        initialQuery={q}
        initialMode={mode}
        searchId={id}
        modelSelectorData={modelSelectorData}
        persistToServer={!isGuest}
      />
    )
  }

  const initialMessages: UIMessage[] =
    simpleUtilityReply === null
      ? []
      : [
          {
            id: generateUUID(),
            role: 'user',
            parts: [{ type: 'text', text: q }]
          },
          {
            id: generateUUID(),
            role: 'assistant',
            parts: [{ type: 'text', text: simpleUtilityReply }],
            metadata: {
              searchMode: 'quick',
              modelId: 'brok-utility'
            }
          }
        ]

  return (
    <Chat
      id={id}
      savedMessages={existingChat?.messages ?? initialMessages}
      query={
        existingChat?.messages.length || simpleUtilityReply !== null
          ? undefined
          : q
      }
      initialQueryMessageId={`${id}_user`}
      initialSearchMode={mode}
      isGuest={isGuest}
      isCloudDeployment={isCloudDeployment}
      modelSelectorData={modelSelectorData}
    />
  )
}
