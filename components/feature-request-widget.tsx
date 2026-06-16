'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'

import { HelpCircle } from 'lucide-react'

import { cn } from '@/lib/utils'

const FeatureRequestWidgetPanel = dynamic(
  () =>
    import('@/components/feature-request-widget-panel').then(
      mod => mod.FeatureRequestWidgetPanel
    ),
  { loading: () => null, ssr: false }
)

export function FeatureRequestWidget() {
  const [open, setOpen] = useState(false)

  return (
    <aside
      className={cn(
        'group fixed right-3 z-[90] transition-all duration-300 ease-out sm:right-4',
        open
          ? 'bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] w-[min(calc(100vw-1.5rem),330px)] sm:bottom-4'
          : 'bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] w-11 hover:w-32 sm:bottom-4'
      )}
      aria-label="Feature request"
    >
      {open ? (
        <FeatureRequestWidgetPanel onClose={() => setOpen(false)} />
      ) : (
        <button
          type="button"
          className="flex min-h-11 w-full items-center gap-2 overflow-hidden rounded-full border border-zinc-200/80 bg-white/88 px-2.5 text-sm font-medium text-zinc-950 shadow-[0_16px_54px_-44px_rgba(24,24,27,0.5)] backdrop-blur transition-all duration-200 hover:border-zinc-300 hover:bg-white"
          onClick={() => setOpen(true)}
          aria-label="Open feature request widget"
        >
          <HelpCircle className="size-5 shrink-0" aria-hidden="true" />
          <span className="whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover:opacity-100">
            Features?
          </span>
        </button>
      )}
    </aside>
  )
}
