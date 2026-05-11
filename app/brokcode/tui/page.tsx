import { redirect } from 'next/navigation'

import { getRequiredBrokAccountUser } from '@/lib/brokcode/account-guard'

import BrokCodeTuiPageClient from '@/components/brokcode/brokcode-tui-page'

export default async function BrokCodeTuiPage() {
  const user = await getRequiredBrokAccountUser()

  if (!user) {
    redirect(`/auth/login?redirectTo=${encodeURIComponent('/brokcode/tui')}`)
  }

  return <BrokCodeTuiPageClient />
}
