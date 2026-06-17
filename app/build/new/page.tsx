import { redirect } from 'next/navigation'

import { requireFeatureAccess } from '@/lib/auth/app-access'

import { BrokBuildWorkspace } from '@/components/build/build-workspace'

export const dynamic = 'force-dynamic'

type SearchParams = {
  prompt?: string
  autostart?: string
}

export default async function BrokBuildNewPage(props: {
  searchParams: Promise<SearchParams>
}) {
  const searchParams = await props.searchParams
  await requireFeatureAccess('/build/new', 'brokcode')

  const prompt = searchParams.prompt?.trim() ?? ''
  if (!prompt) {
    redirect('/build')
  }
  const autoStart = searchParams.autostart === '1'
  return <BrokBuildWorkspace initialPrompt={prompt} autoStart={autoStart} />
}
