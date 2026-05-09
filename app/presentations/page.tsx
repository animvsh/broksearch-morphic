import { Suspense } from 'react'

import { PresentationsDashboard } from '@/components/presentations/dashboard'

// TODO: Replace with actual data fetching from database
// import { getUserPresentations } from '@/lib/presentations/queries'

async function getPresentations() {
  // Temporary placeholder - will be replaced with actual DB query
  // const userId = await getCurrentUserId()
  // return getUserPresentations(userId)
  return []
}

export default async function PresentationsPage() {
  // Fetch presentations on the server
  // const presentations = await getPresentations()

  return (
    <div className="min-h-screen bg-background">
      <main className="container py-8">
        <Suspense fallback={<div className="animate-pulse">Loading...</div>}>
          <PresentationsDashboard />
        </Suspense>
      </main>
    </div>
  )
}
