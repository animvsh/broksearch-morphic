import { BROK_BUILD_EMPTY_CHIPS } from '@/lib/build/app-types'

import { BrokBuildEmptyState } from '@/components/build/empty-state'

export const metadata = {
  title: 'Brok Build — Describe an app, get a hosted preview',
  description:
    'Brok Build is a chat-first app creation surface. Describe an app idea and Brok plans a starter scaffold, saves it into BrokCode, and shows a managed preview.'
}

export default function BrokBuildIndexPage() {
  return <BrokBuildEmptyState chips={BROK_BUILD_EMPTY_CHIPS} />
}

export const dynamic = 'force-dynamic'
