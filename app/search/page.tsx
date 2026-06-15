import { requireFeatureAccess } from '@/lib/auth/app-access'
import { normalizeSearchMode } from '@/lib/config/search-modes'
import { getModelSelectorData } from '@/lib/model-selector/get-model-selector-data'
import type { SearchMode } from '@/lib/types/search'
import { generateUUID } from '@/lib/utils'

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

  return (
    <Chat
      id={id}
      query={q}
      initialSearchMode={mode}
      isGuest={false}
      isCloudDeployment={isCloudDeployment}
      modelSelectorData={modelSelectorData}
    />
  )
}
