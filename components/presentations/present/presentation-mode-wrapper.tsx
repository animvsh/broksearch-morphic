'use client'

import dynamic from 'next/dynamic'

import { type SlideContent } from '@/lib/presentations/theme-utils'
import { type Theme } from '@/lib/presentations/themes'

const PresentationModeClient = dynamic(
  () => import('./presentation-mode').then(mod => mod.PresentationMode),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-screen w-screen items-center justify-center bg-neutral-900">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
      </div>
    )
  }
)

interface PresentationModeWrapperProps {
  slides: SlideContent[]
  theme: Theme
  presentationId: string
}

export function PresentationModeWrapper(props: PresentationModeWrapperProps) {
  return <PresentationModeClient {...props} />
}
