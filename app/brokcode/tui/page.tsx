import { redirect } from 'next/navigation'

import { requireFeatureAccess } from '@/lib/auth/app-access'
import { getRequiredBrokAccountUser } from '@/lib/brokcode/account-guard'

import BrokCodeTuiPageClient from '@/components/brokcode/brokcode-tui-page'

export default async function BrokCodeTuiPage() {
  await requireFeatureAccess('/brokcode/tui', 'brokcode')
  const user = await getRequiredBrokAccountUser()

  if (!user) {
    redirect(`/auth/login?redirectTo=${encodeURIComponent('/brokcode/tui')}`)
  }

  return <BrokCodeTuiPageClient />
}
