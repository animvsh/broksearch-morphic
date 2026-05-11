'use client'

import React, { useState } from 'react'
import Link from 'next/link'

import {
  ArrowRight,
  Clock3,
  FileText,
  Layers3,
  Plus,
  Presentation as PresentationIcon,
  Share2,
  Sparkles,
  WandSparkles
} from 'lucide-react'

import type { FilterTab, Presentation } from '@/lib/presentations/types'
import { cn } from '@/lib/utils'

import { Badge } from '@/components/ui/badge'
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
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="surface-card overflow-hidden"
        >
          <div className="h-40 animate-pulse bg-zinc-100" />
          <div className="space-y-3 p-4">
            <div className="h-4 w-3/4 animate-pulse rounded bg-zinc-100" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-zinc-100" />
            <div className="flex gap-2 pt-2">
              <div className="h-8 flex-1 animate-pulse rounded bg-zinc-100" />
              <div className="h-8 flex-1 animate-pulse rounded bg-zinc-100" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="surface-panel overflow-hidden p-6 sm:p-8">
      <div className="grid gap-8 lg:grid-cols-[1fr_0.8fr] lg:items-center">
        <div className="max-w-xl">
          <Badge
            variant="secondary"
            className="mb-4 rounded-full border border-violet-200 bg-violet-50 text-violet-700"
          >
            <Sparkles className="mr-1.5 size-3.5" />
            Deck studio ready
          </Badge>
          <h3 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">
            Build your first sharp deck.
          </h3>
          <p className="mt-3 max-w-lg text-sm leading-6 text-zinc-500 sm:text-base">
            Start with a topic, generate a clean outline, edit the story, then
            present or export without leaving Brok.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button
              asChild
              className="clicky-control rounded-xl bg-zinc-950 text-white hover:bg-zinc-800"
            >
              <Link href="/presentations/new">
                <Plus className="mr-2 size-4" />
                Create Presentation
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="clicky-control rounded-xl border-zinc-200 bg-white/80"
            >
              <Link href="/playground">
                Tune Prompt
                <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="relative min-h-64 overflow-hidden rounded-3xl border border-zinc-200 bg-zinc-950 p-4 text-white shadow-2xl shadow-zinc-950/10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_18%,rgba(124,58,237,0.45),transparent_34%),radial-gradient(circle_at_80%_80%,rgba(20,184,166,0.28),transparent_32%)]" />
          <div className="relative rounded-2xl border border-white/12 bg-white/8 p-4 backdrop-blur">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-xs font-medium text-white/70">
                <PresentationIcon className="size-4 text-violet-200" />
                Live deck preview
              </span>
              <span className="rounded-full bg-white/12 px-2 py-1 text-[11px] text-white/70">
                16:9
              </span>
            </div>
            <div className="mt-8 space-y-3">
              <div className="h-3 w-24 rounded-full bg-violet-300/80" />
              <div className="h-8 w-3/4 rounded-xl bg-white/90" />
              <div className="h-8 w-1/2 rounded-xl bg-white/70" />
              <div className="grid grid-cols-3 gap-2 pt-6">
                <div className="h-16 rounded-2xl bg-white/12" />
                <div className="h-16 rounded-2xl bg-white/18" />
                <div className="h-16 rounded-2xl bg-white/10" />
              </div>
            </div>
          </div>
        </div>
      </div>
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
  const totalSlides = presentations.reduce(
    (sum, presentation) => sum + presentation.slideCount,
    0
  )
  const readyCount = presentations.filter(p => p.status === 'ready').length
  const sharedCount = presentations.filter(p => p.isPublic && p.shareId).length
  const statCards = [
    {
      label: 'Decks',
      value: presentations.length,
      icon: PresentationIcon,
      accent: 'bg-violet-500'
    },
    {
      label: 'Slides',
      value: totalSlides,
      icon: Layers3,
      accent: 'bg-blue-500'
    },
    {
      label: 'Ready',
      value: readyCount,
      icon: FileText,
      accent: 'bg-emerald-500'
    },
    {
      label: 'Shared',
      value: sharedCount,
      icon: Share2,
      accent: 'bg-orange-500'
    }
  ]

  return (
    <div className="space-y-5">
      <div className="surface-panel overflow-hidden p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Badge
              variant="outline"
              className="mb-3 rounded-full border-violet-200 bg-violet-50/80 text-violet-700"
            >
              <WandSparkles className="mr-1.5 size-3.5" />
              Brok Slides
            </Badge>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
              Presentations
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
              Generate, edit, present, and export polished decks from the same
              AI workspace.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              asChild
              variant="outline"
              className="clicky-control rounded-xl border-zinc-200 bg-white/80"
            >
              <Link href="/library">Open Templates</Link>
            </Button>
            <Button
              asChild
              className="clicky-control rounded-xl bg-zinc-950 text-white hover:bg-zinc-800"
            >
              <Link href="/presentations/new">
                <Plus className="mr-2 size-4" />
                New Presentation
              </Link>
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map(stat => {
            const Icon = stat.icon
            return (
              <div
                key={stat.label}
                className="rounded-2xl border border-zinc-200/80 bg-white/62 p-4 shadow-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-500">
                    {stat.label}
                  </span>
                  <span
                    className={cn(
                      'flex size-7 items-center justify-center rounded-xl text-white',
                      stat.accent
                    )}
                  >
                    <Icon className="size-3.5" />
                  </span>
                </div>
                <p className="mt-3 text-2xl font-semibold tabular-nums text-zinc-950">
                  {stat.value}
                </p>
              </div>
            )
          })}
        </div>
      </div>

      <FilterTabs
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
      />

      {isLoading ? (
        <LoadingSkeleton />
      ) : filteredPresentations.length === 0 ? (
        presentations.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="surface-card flex flex-col items-center justify-center p-10 text-center">
            <Clock3 className="mb-3 size-8 text-zinc-400" />
            <h3 className="text-lg font-semibold text-zinc-950">
              Nothing in this view
            </h3>
            <p className="mt-1 text-sm text-zinc-500">
              Try another filter or create a new deck.
            </p>
          </div>
        )
      ) : (
        <div
          className={cn(
            'grid gap-4',
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
