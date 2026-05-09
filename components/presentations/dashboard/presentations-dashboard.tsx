'use client'

import React, { useState } from 'react'
import Link from 'next/link'

import type { FilterTab, Presentation } from '@/lib/presentations/types'
import { cn } from '@/lib/utils'

import { Button } from '@/components/ui/button'

import { FilterTabs } from './filter-tabs'
import { PresentationCard } from './presentation-card'

// Mock data for development - replace with actual data fetching
const mockPresentations: Presentation[] = [
  {
    id: '1',
    userId: 'user-1',
    title: 'Brok Pitch Deck',
    description: 'Investor presentation for Brok platform',
    status: 'ready',
    slideCount: 12,
    themeId: 'theme-1',
    language: 'en',
    style: 'startup',
    isPublic: false,
    createdAt: new Date(Date.now() - 86400000 * 2),
    updatedAt: new Date(Date.now() - 180000)
  },
  {
    id: '2',
    userId: 'user-1',
    title: 'Q4 Sales Deck',
    description: 'Quarterly sales performance overview',
    status: 'draft',
    slideCount: 8,
    themeId: 'theme-2',
    language: 'en',
    style: 'professional',
    isPublic: false,
    createdAt: new Date(Date.now() - 86400000 * 5),
    updatedAt: new Date(Date.now() - 3600000 * 3)
  },
  {
    id: '3',
    userId: 'user-1',
    title: 'Product Roadmap 2026',
    description: 'Strategic product planning presentation',
    status: 'ready',
    slideCount: 15,
    themeId: 'theme-3',
    language: 'en',
    style: 'professional',
    isPublic: true,
    shareId: 'share-abc123',
    createdAt: new Date(Date.now() - 86400000 * 10),
    updatedAt: new Date(Date.now() - 86400000)
  },
  {
    id: '4',
    userId: 'user-1',
    title: 'Company Introduction',
    description: 'New hire orientation deck',
    status: 'generating',
    slideCount: 20,
    themeId: 'theme-1',
    language: 'en',
    style: 'casual',
    isPublic: false,
    createdAt: new Date(Date.now() - 3600000),
    updatedAt: new Date(Date.now() - 1800000)
  },
  {
    id: '5',
    userId: 'user-1',
    title: 'Marketing Strategy',
    status: 'slides_generating',
    slideCount: 0,
    themeId: 'theme-4',
    language: 'en',
    style: 'professional',
    isPublic: false,
    createdAt: new Date(Date.now() - 7200000),
    updatedAt: new Date(Date.now() - 300000)
  },
  {
    id: '6',
    userId: 'user-1',
    title: 'Weekly Team Standup',
    status: 'draft',
    slideCount: 5,
    themeId: 'theme-2',
    language: 'en',
    style: 'casual',
    isPublic: false,
    createdAt: new Date(Date.now() - 86400000 * 3),
    updatedAt: new Date(Date.now() - 86400000 * 2)
  }
]

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

  // Use initial data or mock data
  const presentations = initialPresentations ?? mockPresentations

  // Filter presentations based on active filter
  const filteredPresentations = presentations.filter((p) => {
    switch (activeFilter) {
      case 'recent':
        // Last 7 days
        return (
          p.updatedAt.getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000
        )
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
          {filteredPresentations.map((presentation) => (
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
