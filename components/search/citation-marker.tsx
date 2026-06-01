'use client'

import { useState } from 'react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

import type { SourceCardData } from './source-card'

interface CitationMarkerProps {
  index: number
  source: SourceCardData | undefined
  onJumpToSource?: (index: number) => void
  className?: string
}

export function CitationMarker({
  index,
  source,
  onJumpToSource,
  className
}: CitationMarkerProps) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Citation ${index}: ${source?.title ?? source?.domain ?? 'source'}`}
          onClick={() => {
            onJumpToSource?.(index)
            const el = document.querySelector(`[data-source-index="${index}"]`)
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' })
              el.classList.add('ring-2', 'ring-foreground/30')
              setTimeout(() => {
                el.classList.remove('ring-2', 'ring-foreground/30')
              }, 1600)
            }
          }}
          className={cn(
            'citation-marker inline-flex h-4 min-w-4 translate-y-[-1px] cursor-pointer items-center justify-center rounded-full px-1 font-mono text-[10px] font-semibold leading-none',
            'bg-foreground/8 text-foreground/80 transition-all',
            'hover:bg-foreground/15 hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            className
          )}
        >
          {index}
        </button>
      </PopoverTrigger>
      {source && (
        <PopoverContent
          side="top"
          align="center"
          sideOffset={6}
          className="w-80 p-3"
        >
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground/10 px-1 font-mono text-[10px] font-semibold text-foreground/80">
                {index}
              </span>
              <span className="truncate">{source.domain}</span>
            </div>
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer noopener"
              className="line-clamp-2 text-sm font-medium leading-snug hover:underline"
            >
              {source.title || source.domain}
            </a>
            {source.snippet && (
              <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                {source.snippet}
              </p>
            )}
          </div>
        </PopoverContent>
      )}
    </Popover>
  )
}

/**
 * Replace inline [1], [2], … tokens in plain text with citation marker components.
 * Returns an array of ReactNodes: strings interleaved with CitationMarker elements.
 */
export function renderCitations(
  text: string,
  sources: SourceCardData[],
  onJumpToSource?: (index: number) => void
): React.ReactNode[] {
  const out: React.ReactNode[] = []
  const regex = /\[(\d+)\]/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      out.push(text.slice(lastIndex, match.index))
    }
    const idx = Number(match[1])
    const source = sources.find(s => Number(s.id) === idx || sources[idx - 1])
    out.push(
      <CitationMarker
        key={`cite-${match.index}-${idx}`}
        index={idx}
        source={source}
        onJumpToSource={onJumpToSource}
      />
    )
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    out.push(text.slice(lastIndex))
  }

  return out
}
