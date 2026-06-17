import { redirect } from 'next/navigation'

import { getAppAccessForUser, hasFeatureAccess } from '@/lib/auth/app-access'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { isGuestSearchEnabled } from '@/lib/auth/guest-search'
import { getModelSelectorData } from '@/lib/model-selector/get-model-selector-data'

import { BrokLanding } from '@/components/brok/brok-landing'
import { SearchLanding } from '@/components/search/search-landing'

export default async function Page() {
  const user = await getCurrentUser()
  const access = await getAppAccessForUser(user)
  const isCloudDeployment = process.env.BROK_CLOUD_DEPLOYMENT === 'true'
  const canUseGuestSearch = !user && isGuestSearchEnabled()

  if (!access.allowed) {
    if (canUseGuestSearch) {
      const modelSelectorData = await getModelSelectorData()

      return (
        <SearchLanding
          isCloudDeployment={isCloudDeployment}
          hasModels={modelSelectorData?.hasAvailableModels !== false}
          modelSelectorData={modelSelectorData}
        />
      )
    }

    return <BrokLanding isSignedIn={Boolean(user)} />
  }

  if (!hasFeatureAccess(access, 'search')) {
    if (hasFeatureAccess(access, 'brokcode')) redirect('/brokcode')
    if (hasFeatureAccess(access, 'brokmail')) redirect('/brokmail')
    if (hasFeatureAccess(access, 'presentations')) redirect('/presentations')
    if (hasFeatureAccess(access, 'tools')) redirect('/tools')
    if (hasFeatureAccess(access, 'api_platform')) redirect('/playground')

    return <BrokLanding isSignedIn={Boolean(user)} />
  }

  const modelSelectorData = await getModelSelectorData()

  return (
    <SearchLanding
      isCloudDeployment={isCloudDeployment}
      hasModels={modelSelectorData?.hasAvailableModels !== false}
      modelSelectorData={modelSelectorData}
    />
  )
}
