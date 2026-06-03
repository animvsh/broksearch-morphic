import { BROK_BUILD_EMPTY_CHIPS } from '@/lib/build/app-types'

import { BrokBuildEmptyState } from '@/components/build/empty-state'

export const metadata = {
  title: 'Brok Build — Describe an app, get a hosted preview',
  description:
    'Brok Build is a chat-first AI app creation platform. Describe an app idea and Brok plans it, builds it, wires the backend, and shows a live preview.'
}

export default function BrokBuildIndexPage() {
  return <BrokBuildEmptyState chips={BROK_BUILD_EMPTY_CHIPS} />
}

export const dynamic = 'force-dynamic'
