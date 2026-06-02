import { redirect } from 'next/navigation'

import { requireFeatureAccess } from '@/lib/auth/app-access'
import { normalizeSearchMode } from '@/lib/config/search-modes'
import { getModelSelectorData } from '@/lib/model-selector/get-model-selector-data'
import { generateUUID } from '@/lib/utils'

import { Chat } from '@/components/chat'

export const maxDuration = 60

export default async function SearchPage(props: {
  searchParams: Promise<{ q: string; mode?: string }>
}) {
  const { q, mode } = await props.searchParams
  if (!q) {
    redirect('/')
  }

  const id = generateUUID()
  const searchMode = normalizeSearchMode(mode)
  const redirectParams = new URLSearchParams({ q, mode: searchMode })
  await requireFeatureAccess(`/search?${redirectParams.toString()}`, 'search')
  const isCloudDeployment = process.env.BROK_CLOUD_DEPLOYMENT === 'true'
  const modelSelectorData = await getModelSelectorData()

  return (
    <Chat
      id={id}
      query={q}
      isGuest={false}
      isCloudDeployment={isCloudDeployment}
      modelSelectorData={modelSelectorData}
      initialSearchMode={searchMode}
    />
  )
}
