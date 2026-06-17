'use client'

import { useEffect, useState } from 'react'

import { Clock, Search, X } from 'lucide-react'

import { normalizeSearchMode } from '@/lib/config/search-modes'
import type { SearchMode } from '@/lib/types/search'
import { cn } from '@/lib/utils'

interface RecentSearch {
  id: string
  query: string
  mode?: SearchMode
  createdAt: number
}

interface RecentSearchesProps {
  onSelect: (query: string, mode?: SearchMode) => void
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
        const normalized = normalizeRecentSearches(parsed)
        setItems(normalized.slice(0, 5))
        const normalizedJson = JSON.stringify(normalized)
        if (normalizedJson !== raw) {
          localStorage.setItem(storageKey, normalizedJson)
        }
      }
    } catch {
      // ignore parse errors
    }
  }, [storageKey])

  if (items.length === 0) return null

  const clearRecentSearches = () => {
    try {
      localStorage.removeItem(storageKey)
    } catch {
      // Local recents are a convenience; failing to clear should not break search.
    }
    setItems([])
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <Clock className="size-3" />
          Recent
        </div>
        <button
          type="button"
          onClick={clearRecentSearches}
          className="inline-flex h-8 items-center gap-1 rounded-full px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Clear recent searches"
        >
          <X className="size-3" />
          Clear
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.query, item.mode)}
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
            {item.mode ? (
              <span className="rounded-full bg-foreground/5 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {item.mode}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  )
}

export function recordRecentSearch(
  query: string,
  mode?: string | null,
  storageKey = 'brok:recent-searches'
) {
  if (typeof window === 'undefined') return
  const trimmed = query.trim()
  if (!trimmed) return
  try {
    const raw = localStorage.getItem(storageKey)
    const existing = normalizeRecentSearches(raw ? JSON.parse(raw) : [])
    const filtered = existing.filter(
      item => item.query.toLowerCase() !== trimmed.toLowerCase()
    )
    const next: RecentSearch[] = [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        query: trimmed,
        mode: normalizeSearchMode(mode),
        createdAt: Date.now()
      },
      ...filtered
    ].slice(0, 10)
    localStorage.setItem(storageKey, JSON.stringify(next))
  } catch {
    // ignore
  }
}

function normalizeRecentSearches(value: unknown): RecentSearch[] {
  if (!Array.isArray(value)) return []

  return value
    .filter((item): item is RecentSearch => {
      return (
        item &&
        typeof item === 'object' &&
        typeof (item as RecentSearch).query === 'string' &&
        (item as RecentSearch).query.trim().length > 0
      )
    })
    .map(item => ({
      id: typeof item.id === 'string' ? item.id : crypto.randomUUID(),
      query: item.query.trim(),
      mode: normalizeSearchMode(
        typeof item.mode === 'string' ? item.mode : undefined
      ),
      createdAt:
        typeof item.createdAt === 'number' && Number.isFinite(item.createdAt)
          ? item.createdAt
          : Date.now()
    }))
}
