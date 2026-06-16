import { redirect } from 'next/navigation'

import { UIMessage } from 'ai'

import { loadChat } from '@/lib/actions/chat'
import { requireFeatureAccess } from '@/lib/auth/app-access'
import {
  getCurrentUser,
  isAnonymousAuthMode
} from '@/lib/auth/get-current-user'
import { isGuestSearchEnabled } from '@/lib/auth/guest-search'
import { getModelSelectorData } from '@/lib/model-selector/get-model-selector-data'

import { BrokSearchClient } from '@/components/brok-search-client'
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
  const effectiveUser =
    isAnonymousAuthMode() && isGuestSearchEnabled() ? null : user
  const chat = effectiveUser ? await loadChat(id, effectiveUser.id) : null

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
  const effectiveUser =
    isAnonymousAuthMode() && isGuestSearchEnabled() ? null : user

  const chat = effectiveUser ? await loadChat(id, effectiveUser.id) : null
  const isCloudDeployment = process.env.BROK_CLOUD_DEPLOYMENT === 'true'
  const modelSelectorData = await getModelSelectorData()

  if (!chat) {
    if (id.startsWith('search_')) {
      if (!effectiveUser && !isGuestSearchEnabled()) {
        redirect('/')
        return null
      }

      return (
        <BrokSearchClient
          searchId={id}
          persistToServer={!!effectiveUser}
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
      isGuest={!effectiveUser}
      isCloudDeployment={isCloudDeployment}
      modelSelectorData={modelSelectorData}
    />
  )
}
