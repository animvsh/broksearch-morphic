import { redirect } from 'next/navigation'

import { getAppAccessForUser, hasFeatureAccess } from '@/lib/auth/app-access'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getModelSelectorData } from '@/lib/model-selector/get-model-selector-data'

import { BrokLanding } from '@/components/brok/brok-landing'
import { Chat } from '@/components/chat'

export default async function Page() {
  const user = await getCurrentUser()
  const access = await getAppAccessForUser(user)
  const isCloudDeployment = process.env.BROK_CLOUD_DEPLOYMENT === 'true'

  if (!access.allowed) {
    return <BrokLanding isSignedIn={Boolean(user)} />
  }

  if (!hasFeatureAccess(access, 'search')) {
    if (hasFeatureAccess(access, 'brokcode')) redirect('/brokcode')
    if (hasFeatureAccess(access, 'brokmail')) redirect('/brokmail')
    if (hasFeatureAccess(access, 'tools')) redirect('/tools')
    if (hasFeatureAccess(access, 'api_platform')) redirect('/playground')

    return <BrokLanding isSignedIn={Boolean(user)} />
  }

  const modelSelectorData = await getModelSelectorData()

  return (
    <Chat
      isGuest={false}
      isCloudDeployment={isCloudDeployment}
      modelSelectorData={modelSelectorData}
    />
  )
}
