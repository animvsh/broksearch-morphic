'use client'

import {
  ArrowDown,
  ArrowRight,
  GitCompare,
  Lightbulb,
  RotateCcw,
  Search
} from 'lucide-react'

import { cn } from '@/lib/utils'

export type FollowUpKind = 'dive-deeper' | 'different-angle' | 'related' | 'compare'

export interface FollowUp {
  id: string
  query: string
  kind: FollowUpKind
}

interface FollowUpSuggestionsProps {
  followUps: FollowUp[]
  onSelect: (followUp: FollowUp) => void
  className?: string
}

const KIND_META: Record<
  FollowUpKind,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  'dive-deeper': { label: 'Dive deeper', icon: ArrowDown },
  'different-angle': { label: 'Different angle', icon: RotateCcw },
  related: { label: 'Related', icon: Search },
  compare: { label: 'Compare', icon: GitCompare }
}

export function FollowUpSuggestions({
  followUps,
  onSelect,
  className
}: FollowUpSuggestionsProps) {
  if (followUps.length === 0) return null

  return (
    <div className={cn('space-y-2.5', className)}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <Lightbulb className="size-3" />
        Follow up
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {followUps.map((fu, idx) => {
          const meta = KIND_META[fu.kind]
          const Icon = meta.icon
          return (
            <button
              key={fu.id}
              type="button"
              onClick={() => onSelect(fu)}
              className={cn(
                'group flex items-start gap-2.5 rounded-xl border border-border/60 bg-card/50 p-3 text-left transition-all duration-200',
                'hover:border-foreground/15 hover:bg-card hover:shadow-sm',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
              )}
              style={{
                animation: `fade-in-up 350ms ease-out ${idx * 50}ms both`
              }}
            >
              <div className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-foreground/5 text-foreground/70 group-hover:text-foreground">
                <Icon className="size-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {meta.label}
                </div>
                <p className="mt-0.5 line-clamp-2 text-sm leading-snug text-foreground/90 group-hover:text-foreground">
                  {fu.query}
                </p>
              </div>
              <ArrowRight className="mt-1.5 size-3.5 shrink-0 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-foreground/70" />
            </button>
          )
        })}
      </div>
    </div>
  )
}
