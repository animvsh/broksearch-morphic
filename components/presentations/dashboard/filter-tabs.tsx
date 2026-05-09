'use client'

import React from 'react'

import type { FilterTab } from '@/lib/presentations/types'
import { FILTER_TAB_LABELS } from '@/lib/presentations/types'
import { cn } from '@/lib/utils'

interface FilterTabsProps {
  activeFilter: FilterTab
  onFilterChange: (filter: FilterTab) => void
}

const tabs: FilterTab[] = [
  'all',
  'recent',
  'shared',
  'drafts',
  'exported',
  'pitch_decks',
  'class_presentations'
]

export function FilterTabs({ activeFilter, onFilterChange }: FilterTabsProps) {
  return (
    <div className="relative">
      <div className="flex overflow-x-auto scrollbar-hide gap-1 pb-2 -mb-2">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => onFilterChange(tab)}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors',
              activeFilter === tab
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            )}
          >
            {FILTER_TAB_LABELS[tab]}
          </button>
        ))}
      </div>
    </div>
  )
}
