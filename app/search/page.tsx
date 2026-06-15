import { requireFeatureAccess } from '@/lib/auth/app-access'
import { normalizeSearchMode } from '@/lib/config/search-modes'
import { getModelSelectorData } from '@/lib/model-selector/get-model-selector-data'
import type { UIMessage } from '@/lib/types/ai'
import type { SearchMode } from '@/lib/types/search'
import { generateUUID } from '@/lib/utils'
import {
  createSimpleUtilityReply,
  isSimpleUtilityText
} from '@/lib/utils/chat-routing'

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

export default async function SearchPage(props: {
  searchParams: Promise<SearchPageParams>
}) {
  const searchParams = await props.searchParams
  const q = firstParam(searchParams.q)?.trim() ?? ''
  const mode = normalizeSearchMode(firstParam(searchParams.mode))
  const redirectTo = buildSearchRedirectPath(q, mode)

  if (!q) {
    await requireFeatureAccess(redirectTo, 'search')
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

  const id = generateUUID()
  await requireFeatureAccess(redirectTo, 'search')
  const isCloudDeployment = process.env.BROK_CLOUD_DEPLOYMENT === 'true'
  const modelSelectorData = await getModelSelectorData()
  const simpleUtilityReply = isSimpleUtilityText(q)
    ? createSimpleUtilityReply(q)
    : null
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
      savedMessages={initialMessages}
      query={simpleUtilityReply === null ? q : undefined}
      initialSearchMode={mode}
      isGuest={false}
      isCloudDeployment={isCloudDeployment}
      modelSelectorData={modelSelectorData}
    />
  )
}
