'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'

import type { FilterTab, Presentation } from '@/lib/presentations/types'
import { cn } from '@/lib/utils'

import { Button } from '@/components/ui/button'

import { FilterTabs } from './filter-tabs'
import { PresentationCard } from './presentation-card'

function normalizePresentationDates(
  presentation: Presentation & {
    createdAt: Date | string
    updatedAt: Date | string
  }
): Presentation {
  return {
    ...presentation,
    createdAt:
      presentation.createdAt instanceof Date
        ? presentation.createdAt
        : new Date(presentation.createdAt),
    updatedAt:
      presentation.updatedAt instanceof Date
        ? presentation.updatedAt
        : new Date(presentation.updatedAt)
  }
}

interface PresentationsDashboardProps {
  initialPresentations?: Presentation[]
  isLoading?: boolean
}

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border bg-card overflow-hidden animate-pulse"
        >
          <div className="h-40 bg-muted" />
          <div className="p-4 space-y-3">
            <div className="h-4 bg-muted rounded w-3/4" />
            <div className="h-3 bg-muted rounded w-1/2" />
            <div className="flex gap-2 pt-2">
              <div className="h-8 bg-muted rounded flex-1" />
              <div className="h-8 bg-muted rounded flex-1" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 mb-4 rounded-full bg-muted flex items-center justify-center">
        <svg
          className="w-8 h-8 text-muted-foreground"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-1">
        No presentations yet
      </h3>
      <p className="text-muted-foreground mb-4">
        Create your first presentation to get started
      </p>
      <Button asChild>
        <Link href="/presentations/new">Create Presentation</Link>
      </Button>
    </div>
  )
}

export function PresentationsDashboard({
  initialPresentations,
  isLoading = false
}: PresentationsDashboardProps) {
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all')
  const [now] = useState(() => Date.now())
  const presentations = (initialPresentations ?? []).map(
    normalizePresentationDates
  )

  // Filter presentations based on active filter
  const filteredPresentations = presentations.filter(p => {
    switch (activeFilter) {
      case 'recent':
        // Last 7 days
        return p.updatedAt.getTime() > now - 7 * 24 * 60 * 60 * 1000
      case 'shared':
        return p.isPublic && p.shareId
      case 'drafts':
        return p.status === 'draft'
      case 'exported':
        // This would need export data - for now show ready presentations
        return p.status === 'ready'
      case 'pitch_decks':
        return p.style === 'startup' || p.title.toLowerCase().includes('pitch')
      case 'class_presentations':
        return p.style === 'academic'
      case 'all':
      default:
        return true
    }
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Presentations</h1>
        <Button asChild>
          <Link href="/presentations/new">New Presentation</Link>
        </Button>
      </div>

      {/* Filter Tabs */}
      <FilterTabs
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
      />

      {/* Content */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : filteredPresentations.length === 0 ? (
        <EmptyState />
      ) : (
        <div
          className={cn(
            'grid gap-6',
            'grid-cols-1',
            'sm:grid-cols-2',
            'lg:grid-cols-3',
            'xl:grid-cols-4'
          )}
        >
          {filteredPresentations.map(presentation => (
            <PresentationCard
              key={presentation.id}
              presentation={presentation}
            />
          ))}
        </div>
      )}
    </div>
  )
}
