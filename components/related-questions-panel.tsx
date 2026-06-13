'use client'

import { useState } from 'react'

import { ChevronRight, Sparkles } from 'lucide-react'

import { cn } from '@/lib/utils'

import { FollowUpItem } from './follow-up-chips'

interface RelatedQuestionsPanelProps {
  followUps: FollowUpItem[]
  onSelect: (query: string) => void
  className?: string
  isLoading?: boolean
}

/**
 * Right-rail panel for "Related questions" (PRD section 17).
 *
 * Renders a list of follow-up questions the user can click to deepen the
 * conversation. Stays collapsed on mobile to avoid taking up vertical space.
 */
export function RelatedQuestionsPanel({
  followUps,
  onSelect,
  className,
  isLoading = false
}: RelatedQuestionsPanelProps) {
  const [collapsed, setCollapsed] = useState(false)

  if (followUps.length === 0 && !isLoading) {
    return null
  }

  return (
    <aside
      className={cn(
        'hidden w-72 shrink-0 border-l border-zinc-200/70 bg-zinc-50/40 px-4 py-6 lg:block',
        className
      )}
      data-testid="related-questions-panel"
      aria-label="Related questions"
    >
      <div className="sticky top-6">
        <button
          type="button"
          onClick={() => setCollapsed(prev => !prev)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500 hover:text-zinc-700"
          aria-expanded={!collapsed}
        >
          <ChevronRight
            className={cn(
              'size-3.5 transition-transform',
              !collapsed && 'rotate-90'
            )}
          />
          Related questions
        </button>
        {!collapsed && (
          <div className="mt-3 flex flex-col gap-2">
            {isLoading && followUps.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Sparkles className="size-3.5" />
                <span>Finding related topics...</span>
              </div>
            ) : null}
            {followUps.map((followUp, index) => (
              <button
                key={`${followUp.label}-${index}`}
                type="button"
                onClick={() => onSelect(followUp.query)}
                className="group flex flex-col items-start gap-0.5 rounded-lg border border-zinc-200/70 bg-white/80 px-3 py-2 text-left text-xs text-zinc-700 shadow-[0_4px_18px_-12px_rgba(15,23,42,0.18)] transition-all hover:border-zinc-300 hover:bg-white hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
                data-testid={`related-question-${index}`}
              >
                <span className="font-medium">{followUp.label}</span>
                <span className="line-clamp-2 text-[11px] text-zinc-500 group-hover:text-zinc-600">
                  {followUp.query}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}
