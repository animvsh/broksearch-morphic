'use client'

import { ArrowRight } from 'lucide-react'

import { cn } from '@/lib/utils'

export interface FollowUpItem {
  label: string
  query: string
}

interface FollowUpChipsProps {
  followUps: FollowUpItem[]
  onSelect: (query: string) => void
  disabled?: boolean
  className?: string
  emptyHint?: string
  isLoading?: boolean
}

/**
 * Renders follow-up questions as clickable chips below an answer.
 *
 * PRD section 12 (Follow-Up Questions): the search experience should suggest
 * 4-5 grounded follow-up questions the user can ask next. The chips here
 * render those suggestions, plus an empty hint while they are being
 * generated so the layout does not jump.
 */
export function FollowUpChips({
  followUps,
  onSelect,
  disabled = false,
  className,
  emptyHint,
  isLoading = false
}: FollowUpChipsProps) {
  if (followUps.length === 0 && !isLoading && !emptyHint) {
    return null
  }

  return (
    <div
      className={cn(
        'mt-3 flex flex-wrap items-center gap-2 text-xs',
        className
      )}
      data-testid="follow-up-chips"
      aria-label="Follow-up questions"
    >
      <span className="text-muted-foreground/80">Related</span>
      {followUps.length > 0 ? (
        followUps.map((followUp, index) => (
          <button
            key={`${followUp.label}-${index}`}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(followUp.query)}
            className={cn(
              'group inline-flex items-center gap-1.5 rounded-full border border-zinc-200/80 bg-white/80 px-3 py-1 text-xs font-medium text-zinc-700 shadow-[0_4px_18px_-12px_rgba(15,23,42,0.18)] backdrop-blur transition-all hover:border-zinc-300 hover:bg-white hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 disabled:cursor-not-allowed disabled:opacity-60'
            )}
            data-testid={`follow-up-chip-${index}`}
          >
            <span className="truncate max-w-[14rem]">{followUp.label}</span>
            <ArrowRight className="size-3 text-zinc-400 transition-transform group-hover:translate-x-0.5 group-hover:text-zinc-600" />
          </button>
        ))
      ) : isLoading ? (
        <span className="inline-flex items-center gap-1.5 text-muted-foreground/80">
          <span className="typing-dots" aria-hidden>
            <span />
            <span />
            <span />
          </span>
          <span>Generating related questions...</span>
        </span>
      ) : emptyHint ? (
        <span className="text-muted-foreground/80">{emptyHint}</span>
      ) : null}
    </div>
  )
}
