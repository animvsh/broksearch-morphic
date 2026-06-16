import { redirect } from 'next/navigation'

import { UIMessage } from 'ai'

import { loadChat } from '@/lib/actions/chat'
import { requireFeatureAccess } from '@/lib/auth/app-access'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { isGuestSearchEnabled } from '@/lib/auth/guest-search'
import { getModelSelectorData } from '@/lib/model-selector/get-model-selector-data'

import { Chat } from '@/components/chat'

export const maxDuration = 60

export async function generateMetadata(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params
  const user = await getCurrentUser().catch(error => {
    if (isGuestSearchEnabled()) return null
    throw error
  })

  const chat = user ? await loadChat(id, user.id) : null

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
  const user = await getCurrentUser().catch(error => {
    if (isGuestSearchEnabled()) return null
    throw error
  })

  const chat = user ? await loadChat(id, user.id) : null
  const isCloudDeployment = process.env.BROK_CLOUD_DEPLOYMENT === 'true'
  const modelSelectorData = await getModelSelectorData()

  if (!chat) {
    if (!user && isGuestSearchEnabled() && id.startsWith('search_')) {
      return (
        <Chat
          id={id}
          savedMessages={[]}
          isGuest
          isCloudDeployment={isCloudDeployment}
          modelSelectorData={modelSelectorData}
        />
      )
    }

    redirect('/')
    return null
  }

  if (chat.visibility === 'private') {
    await requireFeatureAccess(`/search/${id}`, 'search')
  }

  const messages: UIMessage[] = chat.messages

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
