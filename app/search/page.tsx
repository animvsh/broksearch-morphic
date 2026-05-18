import { redirect } from 'next/navigation'

import { requireAppAccess } from '@/lib/auth/app-access'
import { getModelSelectorData } from '@/lib/model-selector/get-model-selector-data'
import { generateUUID } from '@/lib/utils'

import { Chat } from '@/components/chat'

export const maxDuration = 60

export default async function SearchPage(props: {
  searchParams: Promise<{ q: string }>
}) {
  const { q } = await props.searchParams
  if (!q) {
    redirect('/')
  }

  const id = generateUUID()
  await requireAppAccess(`/search?q=${encodeURIComponent(q)}`)
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
