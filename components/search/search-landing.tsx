'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import type { ModelSelectorData } from '@/lib/types/model-selector'
import type { SearchMode } from '@/lib/types/search'
import { cn } from '@/lib/utils'

import { Hero } from '@/components/search/hero'

interface SearchLandingProps {
  defaultMode?: SearchMode
  isCloudDeployment?: boolean
  hasModels?: boolean
  modelSelectorData?: ModelSelectorData | null
  className?: string
}

export function SearchLanding({
  defaultMode,
  isCloudDeployment = false,
  hasModels = true,
  modelSelectorData,
  className
}: SearchLandingProps) {
  const router = useRouter()
  const submittingRef = useRef(false)
  const resetTimerRef = useRef<number | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = (query: string, mode: string) => {
    if (submittingRef.current) return
    submittingRef.current = true
    setIsSubmitting(true)
    const params = new URLSearchParams({
      q: query,
      mode
    })
    router.push(`/search?${params.toString()}`)
    resetTimerRef.current = window.setTimeout(() => {
      submittingRef.current = false
      setIsSubmitting(false)
      resetTimerRef.current = null
    }, 4000)
  }

  const handleStop = () => {
    if (resetTimerRef.current) {
      window.clearTimeout(resetTimerRef.current)
      resetTimerRef.current = null
    }
    submittingRef.current = false
    setIsSubmitting(false)
  }

  useEffect(() => {
    submittingRef.current = false
    return () => {
      if (resetTimerRef.current) {
        window.clearTimeout(resetTimerRef.current)
        resetTimerRef.current = null
      }
    }
  }, [])

  return (
    <main
      className={cn(
        'flex min-h-[calc(100dvh-4rem)] w-full flex-col items-center justify-center',
        className
      )}
    >
      <Hero
        onSubmit={handleSubmit}
        defaultMode={defaultMode}
        isCloudDeployment={isCloudDeployment}
        hasModels={hasModels}
        modelSelectorData={modelSelectorData}
        attachmentsEnabled={false}
        isSubmitting={isSubmitting}
        onStop={handleStop}
      />
    </main>
  )
}
