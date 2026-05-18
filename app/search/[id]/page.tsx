import { redirect } from 'next/navigation'

import { UIMessage } from 'ai'

import { loadChat } from '@/lib/actions/chat'
import { requireAppAccess } from '@/lib/auth/app-access'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getModelSelectorData } from '@/lib/model-selector/get-model-selector-data'

import { Chat } from '@/components/chat'

export const maxDuration = 60

export async function generateMetadata(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params
  const user = await getCurrentUser()

  const chat = await loadChat(id, user?.id)

  if (!chat) {
    return { title: 'Search' }
  }

  return {
    title: chat.title.toString().slice(0, 50) || 'Search'
  }
}

export default async function SearchPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params
  const user = await getCurrentUser()

  const chat = await loadChat(id, user?.id)

  if (!chat) {
    redirect('/')
  }

  if (chat.visibility === 'private') {
    await requireAppAccess(`/search/${id}`)
  }

  const messages: UIMessage[] = chat.messages
  const isCloudDeployment = process.env.BROK_CLOUD_DEPLOYMENT === 'true'
  const modelSelectorData = await getModelSelectorData()

  return (
    <Chat
      id={id}
      savedMessages={messages}
      isGuest={!user}
      isCloudDeployment={isCloudDeployment}
      modelSelectorData={modelSelectorData}
    />
  )
}
