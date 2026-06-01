'use client'

import { useEffect, useMemo, useState } from 'react'

import { ArrowUpRight, Code2, Lightbulb, Newspaper, Repeat, Sparkles } from 'lucide-react'

import type { SearchMode } from '@/lib/types/search'
import { cn } from '@/lib/utils'

import { EXAMPLE_QUERIES, type ExampleQuery } from './example-queries-data'

const CATEGORY_META: Record<
  ExampleQuery['category'],
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  research: { label: 'Research', icon: Sparkles },
  code: { label: 'Code', icon: Code2 },
  comparison: { label: 'Compare', icon: Repeat },
  'how-to': { label: 'How-to', icon: Lightbulb },
  news: { label: 'News', icon: Newspaper },
  explain: { label: 'Explain', icon: Sparkles }
}

interface ExampleQueriesProps {
  onSelect: (query: string, mode?: SearchMode) => void
  count?: number
  className?: string
}

export function ExampleQueries({
  onSelect,
  count = 6,
  className
}: ExampleQueriesProps) {
  const [seed, setSeed] = useState(0)

  const items = useMemo(() => {
    const shuffled = [...EXAMPLE_QUERIES]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = (seed * 7 + i * 13) % (i + 1)
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled.slice(0, count)
  }, [count, seed])

  useEffect(() => {
    const interval = setInterval(() => setSeed(s => s + 1), 30_000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className={cn('grid gap-2.5 sm:grid-cols-2', className)}>
      {items.map((q, idx) => {
        const meta = CATEGORY_META[q.category]
        const Icon = meta.icon
        return (
          <button
            key={`${q.id}-${seed}`}
            type="button"
            onClick={() => onSelect(q.query, q.mode)}
            className={cn(
              'group flex items-start gap-3 rounded-xl border border-border/60 bg-card/50 p-3.5 text-left transition-all duration-200',
              'hover:border-foreground/15 hover:bg-card hover:shadow-sm',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
            )}
            style={{
              animation: `fade-in-up 350ms ease-out ${idx * 40}ms both`
            }}
          >
            <div className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-foreground/5 text-foreground">
              <Icon className="size-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {meta.label}
              </div>
              <p className="mt-0.5 line-clamp-2 text-sm leading-snug text-foreground/90 group-hover:text-foreground">
                {q.query}
              </p>
            </div>
            <ArrowUpRight className="size-4 shrink-0 text-muted-foreground/40 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground/70" />
          </button>
        )
      })}
    </div>
  )
}
