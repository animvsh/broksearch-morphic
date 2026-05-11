import { Suspense } from 'react'

import { getCurrentUserId } from '@/lib/auth/get-current-user'
import { getPresentationsByUser } from '@/lib/db/actions/presentations'
import type { PresentationStyle } from '@/lib/presentations/types'

import { PresentationsDashboard } from '@/components/presentations/dashboard'

export const dynamic = 'force-dynamic'

const PRESENTATION_STYLES = new Set<PresentationStyle>([
  'startup',
  'professional',
  'casual',
  'academic'
])

export default async function PresentationsPage() {
  const userId = await getCurrentUserId()
  const result = userId
    ? await getPresentationsByUser(userId, 50, 0)
    : { presentations: [] }
  const presentations = result.presentations.map(presentation => ({
    ...presentation,
    description: presentation.description ?? undefined,
    themeId: presentation.themeId ?? undefined,
    style: PRESENTATION_STYLES.has(presentation.style as PresentationStyle)
      ? (presentation.style as PresentationStyle)
      : undefined,
    shareId: presentation.shareId ?? undefined,
    workspaceId: presentation.workspaceId ?? undefined
  }))

  return (
    <div className="platform-page">
      <main className="platform-container">
        <Suspense fallback={<div className="animate-pulse">Loading...</div>}>
          <PresentationsDashboard initialPresentations={presentations} />
        </Suspense>
      </main>
    </div>
  )
}
