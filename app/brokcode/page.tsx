import { redirect } from 'next/navigation'

import { getRequiredBrokAccountUser } from '@/lib/brokcode/account-guard'

import { BrokCodeApp } from '@/components/brokcode/brokcode-app'

export default async function BrokCodePage(props: {
  searchParams: Promise<{
    prompt?: string
    autostart?: string
    connect?: string
  }>
}) {
  const searchParams = await props.searchParams
  const user = await getRequiredBrokAccountUser()

  if (!user) {
    redirect(`/auth/login?redirectTo=${encodeURIComponent('/brokcode')}`)
  }

  return (
    <BrokCodeApp
      initialPrompt={searchParams.prompt ?? ''}
      autoStart={searchParams.autostart === '1'}
      connectGithub={searchParams.connect === 'github'}
      accountEmail={user.email ?? 'Brok account'}
    />
  )
}
