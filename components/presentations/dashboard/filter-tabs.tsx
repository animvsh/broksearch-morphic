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
    <div className="relative -mx-1 overflow-hidden px-1">
      <div className="flex gap-1 overflow-x-auto rounded-2xl border border-zinc-200/80 bg-white/72 p-1 shadow-xs backdrop-blur-xl">
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => onFilterChange(tab)}
            className={cn(
              'clicky-control whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-medium transition-all duration-150',
              activeFilter === tab
                ? 'bg-zinc-950 text-white shadow-sm'
                : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950'
            )}
          >
            {FILTER_TAB_LABELS[tab]}
          </button>
        ))}
      </div>
    </div>
  )
}
