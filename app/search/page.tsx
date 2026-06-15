import { requireFeatureAccess } from '@/lib/auth/app-access'
import { getModelSelectorData } from '@/lib/model-selector/get-model-selector-data'
import { generateUUID } from '@/lib/utils'

import { Chat } from '@/components/chat'
import { SearchLanding } from '@/components/search/search-landing'

export const maxDuration = 60

export default async function SearchPage(props: {
  searchParams: Promise<{ q: string }>
}) {
  const { q } = await props.searchParams
  if (!q) {
    await requireFeatureAccess('/search', 'search')
    const isCloudDeployment = process.env.BROK_CLOUD_DEPLOYMENT === 'true'
    const modelSelectorData = await getModelSelectorData()

    return (
      <SearchLanding
        isCloudDeployment={isCloudDeployment}
        hasModels={modelSelectorData?.hasAvailableModels !== false}
      />
    )
  }

  const id = generateUUID()
  await requireFeatureAccess(`/search?q=${encodeURIComponent(q)}`, 'search')
  const isCloudDeployment = process.env.BROK_CLOUD_DEPLOYMENT === 'true'
  const modelSelectorData = await getModelSelectorData()

  return (
    <Chat
      id={id}
      query={q}
      isGuest={false}
      isCloudDeployment={isCloudDeployment}
      modelSelectorData={modelSelectorData}
    />
  )
}
