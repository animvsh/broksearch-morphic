'use client'

import { PendingAnswer } from '@/components/search/pending-answer'

export default function Loading() {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center bg-background">
      <div className="flex w-full max-w-3xl flex-col gap-4 px-4 pt-8 sm:px-6 sm:pt-12">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="size-2 rounded-full bg-emerald-500" />
          <span>Starting Brok Search</span>
        </div>
        <div className="ml-auto h-10 w-36 animate-pulse rounded-2xl border border-zinc-200 bg-white" />
        <PendingAnswer />
      </div>
    </div>
  )
}
