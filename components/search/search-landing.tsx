'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

import { generateId } from '@/lib/db/schema'
import { cn } from '@/lib/utils'

import { Hero } from '@/components/search/hero'
import { recordRecentSearch } from '@/components/search/recent-searches'

interface SearchLandingProps {
  isCloudDeployment?: boolean
  hasModels?: boolean
  className?: string
}

export function SearchLanding({
  isCloudDeployment = false,
  hasModels = true,
  className
}: SearchLandingProps) {
  const router = useRouter()
  const submittingRef = useRef(false)

  const handleSubmit = (query: string, mode: string, _files: File[]) => {
    if (submittingRef.current) return
    submittingRef.current = true
    const chatId = generateId()
    recordRecentSearch(query, mode)
    const params = new URLSearchParams({
      q: query,
      mode
    })
    router.push(`/search/${chatId}?${params.toString()}`)
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
        isCloudDeployment={isCloudDeployment}
        hasModels={hasModels}
      />
    </main>
  )
}
