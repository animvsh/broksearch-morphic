'use client'

/* eslint-disable @next/next/no-img-element -- source favicons come from arbitrary citation domains */

import { useState } from 'react'

import { ExternalLink, PanelRightOpen, Star } from 'lucide-react'

import { cn } from '@/lib/utils'

export interface SourceCardData {
  id: string
  url: string
  title: string
  domain: string
  favicon?: string
  snippet?: string
  relevanceScore?: number
  publishedAt?: string
}

interface SourceCardProps {
  source: SourceCardData
  index: number
  onOpen?: (source: SourceCardData) => void
  className?: string
}

export function SourceCard({
  source,
  index,
  onOpen,
  className
}: SourceCardProps) {
  const [expanded, setExpanded] = useState(false)
  const snippet = source.snippet ?? ''
  const longSnippet = snippet.length > 220
  const visibleSnippet =
    longSnippet && !expanded ? `${snippet.slice(0, 220)}…` : snippet

  return (
    <article
      className={cn(
        'group relative flex gap-3 rounded-xl border border-border/60 bg-card p-3.5 transition-all duration-200',
        'hover:border-foreground/15 hover:shadow-sm',
        className
      )}
      data-source-index={index}
    >
      <div className="flex shrink-0 flex-col items-center gap-1.5 pt-0.5">
        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-foreground/5 px-1.5 font-mono text-xs font-medium text-foreground/80">
          {index}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => onOpen?.(source)}
              className={cn(
                'line-clamp-2 text-left text-sm font-medium leading-snug text-foreground/90 transition-colors',
                'hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded'
              )}
            >
              {source.title || source.domain}
            </button>
            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <SourceFavicon domain={source.domain} favicon={source.favicon} />
              <span className="truncate">{source.domain}</span>
              {source.publishedAt && (
                <>
                  <span aria-hidden>·</span>
                  <span className="shrink-0">{source.publishedAt}</span>
                </>
              )}
              {typeof source.relevanceScore === 'number' && (
                <>
                  <span aria-hidden>·</span>
                  <span className="inline-flex items-center gap-0.5 text-amber-600/80">
                    <Star className="size-2.5 fill-current" />
                    <span>{Math.round(source.relevanceScore * 100)}%</span>
                  </span>
                </>
              )}
            </div>
          </div>
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer noopener"
            className={cn(
              'inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors',
              'hover:bg-foreground/5 hover:text-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
            aria-label={`Open ${source.domain} in new tab`}
          >
            <ExternalLink className="size-3.5" />
          </a>
        </div>

        {visibleSnippet && (
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {visibleSnippet}
            {longSnippet && (
              <button
                type="button"
                onClick={() => setExpanded(v => !v)}
                className="ml-1 font-medium text-foreground/70 hover:text-foreground"
              >
                {expanded ? 'less' : 'more'}
              </button>
            )}
          </p>
        )}
        {onOpen && (
          <button
            type="button"
            onClick={() => onOpen(source)}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-foreground/70 transition-colors hover:text-foreground"
          >
            Inspect source
            <PanelRightOpen className="size-3.5" />
          </button>
        )}
      </div>
    </article>
  )
}

function SourceFavicon({
  domain,
  favicon
}: {
  domain: string
  favicon?: string
}) {
  const [failed, setFailed] = useState(false)
  if (favicon && !failed) {
    return (
      <span className="inline-flex size-3.5 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-foreground/5">
        <img
          src={favicon}
          alt=""
          width={14}
          height={14}
          className="size-3.5 object-cover"
          onError={() => setFailed(true)}
        />
      </span>
    )
  }
  const letter =
    domain
      .replace(/^www\./, '')
      .charAt(0)
      .toUpperCase() || '?'
  return (
    <span className="inline-flex size-3.5 shrink-0 items-center justify-center rounded-sm bg-foreground/10 font-mono text-[8px] font-bold uppercase text-foreground/70">
      {letter}
    </span>
  )
}

interface SourcesPanelProps {
  sources: SourceCardData[]
  defaultExpanded?: boolean
  onOpenSource?: (source: SourceCardData) => void
  className?: string
}

export function SourcesPanel({
  sources,
  defaultExpanded = true,
  onOpenSource,
  className
}: SourcesPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  if (sources.length === 0) return null

  return (
    <section className={cn('space-y-2.5', className)}>
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className={cn(
          'group flex w-full items-center justify-between gap-2 rounded-lg px-1 py-1 text-left transition-colors',
          'hover:bg-foreground/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded'
        )}
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Sources
          </span>
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground/5 px-1.5 text-[11px] font-medium text-foreground/80">
            {sources.length}
          </span>
        </div>
        <span className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground/80">
          {expanded ? 'Hide' : 'Show all'}
        </span>
      </button>

      {expanded && (
        <div className="grid gap-2 sm:grid-cols-2">
          {sources.map((src, idx) => (
            <SourceCard
              key={src.id}
              source={src}
              index={idx + 1}
              onOpen={onOpenSource}
            />
          ))}
        </div>
      )}
    </section>
  )
}
