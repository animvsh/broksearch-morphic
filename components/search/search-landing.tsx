'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

import type { SearchMode } from '@/lib/types/search'
import { cn } from '@/lib/utils'

import { Hero } from '@/components/search/hero'

interface SearchLandingProps {
  defaultMode?: SearchMode
  isCloudDeployment?: boolean
  hasModels?: boolean
  className?: string
}

export function SearchLanding({
  defaultMode,
  isCloudDeployment = false,
  hasModels = true,
  className
}: SearchLandingProps) {
  const router = useRouter()
  const submittingRef = useRef(false)

  const handleSubmit = (query: string, mode: string, _files: File[]) => {
    if (submittingRef.current) return
    submittingRef.current = true
    const params = new URLSearchParams({
      q: query,
      mode
    })
    router.push(`/search?${params.toString()}`)
  }

  useEffect(() => {
    submittingRef.current = false
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
      />
    </main>
  )
}
