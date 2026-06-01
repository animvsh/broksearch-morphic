'use client'

/* eslint-disable react-hooks/set-state-in-effect -- localStorage sync is the documented pattern */

import { useEffect, useState } from 'react'

import { Clock, Search } from 'lucide-react'

import { cn } from '@/lib/utils'

interface RecentSearch {
  id: string
  query: string
  mode?: string
  createdAt: number
}

interface RecentSearchesProps {
  onSelect: (query: string) => void
  className?: string
  storageKey?: string
}

export function RecentSearches({
  onSelect,
  className,
  storageKey = 'brok:recent-searches'
}: RecentSearchesProps) {
  const [items, setItems] = useState<RecentSearch[]>([])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return
      const parsed = JSON.parse(raw) as RecentSearch[]
      if (Array.isArray(parsed)) {
        setItems(parsed.slice(0, 5))
      }
    } catch {
      // ignore parse errors
    }
  }, [storageKey])

  if (items.length === 0) return null

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Clock className="size-3" />
        Recent
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.query)}
            className={cn(
              'group inline-flex max-w-full items-center gap-2 rounded-full border border-border/60 bg-card/50 px-3 py-1.5 text-xs transition-all',
              'hover:border-foreground/15 hover:bg-card hover:shadow-sm',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
            )}
          >
            <Search className="size-3 shrink-0 text-muted-foreground group-hover:text-foreground" />
            <span className="truncate text-foreground/80 group-hover:text-foreground">
              {item.query}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function recordRecentSearch(
  query: string,
  mode?: string,
  storageKey = 'brok:recent-searches'
) {
  if (typeof window === 'undefined') return
  try {
    const raw = localStorage.getItem(storageKey)
    const existing: RecentSearch[] = raw ? JSON.parse(raw) : []
    const filtered = existing.filter(
      item => item.query.toLowerCase() !== query.toLowerCase()
    )
    const next: RecentSearch[] = [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        query,
        mode,
        createdAt: Date.now()
      },
      ...filtered
    ].slice(0, 10)
    localStorage.setItem(storageKey, JSON.stringify(next))
  } catch {
    // ignore
  }
}
