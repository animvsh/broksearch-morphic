'use client'

/* eslint-disable @next/next/no-img-element -- source favicons come from arbitrary citation domains */

import { useState } from 'react'

import { Check, Copy, ExternalLink, PanelRightOpen, Star } from 'lucide-react'

import { cn } from '@/lib/utils'
import { safeCopyTextToClipboard } from '@/lib/utils/copy-to-clipboard'

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
  const snippet = source.snippet ?? ''
  const title = source.title || source.domain
  const [copied, setCopied] = useState(false)

  const copySourceLink = async () => {
    const didCopy = await safeCopyTextToClipboard(source.url)
    if (!didCopy) return
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <article
      className={cn(
        'group relative flex min-w-0 items-start gap-2.5 rounded-lg border border-border/60 bg-card/70 px-2.5 py-2 transition-all duration-200',
        'hover:border-foreground/15 hover:bg-card hover:shadow-sm',
        className
      )}
      data-source-index={index}
    >
      <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground/[0.06] font-mono text-[10px] font-semibold text-foreground/75">
        {index}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <button
            type="button"
            onClick={() => onOpen?.(source)}
            className={cn(
              'line-clamp-1 min-w-0 text-left text-sm font-medium leading-5 text-foreground/90 transition-colors',
              'hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded'
            )}
            title={title}
          >
            {title}
          </button>

          <div className="flex shrink-0 items-center gap-0.5">
            {onOpen && (
              <button
                type="button"
                onClick={() => onOpen(source)}
                className={cn(
                  'inline-flex size-11 items-center justify-center rounded-md text-muted-foreground transition-colors',
                  'hover:bg-foreground/5 hover:text-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                )}
                aria-label={`Verify ${title}`}
                title="Verify source"
              >
                <PanelRightOpen className="size-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={copySourceLink}
              className={cn(
                'inline-flex size-11 items-center justify-center rounded-md text-muted-foreground transition-colors',
                'hover:bg-foreground/5 hover:text-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
              )}
              aria-label={
                copied
                  ? `Source link copied: ${title}`
                  : `Copy source link: ${title}`
              }
              title={copied ? 'Source link copied' : 'Copy source link'}
            >
              {copied ? (
                <Check className="size-3.5" />
              ) : (
                <Copy className="size-3.5" />
              )}
            </button>
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer noopener"
              className={cn(
                'inline-flex size-11 items-center justify-center rounded-md text-muted-foreground transition-colors',
                'hover:bg-foreground/5 hover:text-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
              )}
              aria-label={`Open ${source.domain} in new tab`}
              title="Open original"
            >
              <ExternalLink className="size-3.5" />
            </a>
          </div>
        </div>

        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] leading-4 text-muted-foreground">
          <SourceFavicon domain={source.domain} favicon={source.favicon} />
          <span className="max-w-[13rem] truncate">{source.domain}</span>
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

        {snippet && (
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
            {snippet}
          </p>
        )}
      </div>
    </article>
  )
}

export function SourceCompactChip({
  source,
  index,
  onOpen
}: {
  source: SourceCardData
  index: number
  onOpen?: (source: SourceCardData) => void
}) {
  const title = source.title || source.domain

  return (
    <button
      type="button"
      onClick={() => onOpen?.(source)}
      className={cn(
        'inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border border-border/70 bg-card px-2.5 text-xs text-foreground/85 transition-colors',
        'hover:border-foreground/15 hover:bg-foreground/[0.035]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      )}
      aria-label={`Verify source ${index}: ${title}`}
      title={title}
    >
      <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-foreground/[0.07] font-mono text-[9px] font-semibold text-foreground/75">
        {index}
      </span>
      <SourceFavicon domain={source.domain} favicon={source.favicon} />
      <span className="truncate">{source.domain}</span>
      {source.publishedAt && (
        <>
          <span aria-hidden className="text-muted-foreground/70">
            ·
          </span>
          <span className="shrink-0 text-muted-foreground">
            {source.publishedAt}
          </span>
        </>
      )}
    </button>
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
    <section className={cn('space-y-2', className)}>
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className={cn(
          'group flex w-full items-center justify-between gap-2 rounded-lg px-1 py-0.5 text-left transition-colors',
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

      {!expanded && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {sources.slice(0, 6).map((src, idx) => (
            <SourceCompactChip
              key={src.id}
              source={src}
              index={idx + 1}
              onOpen={onOpenSource}
            />
          ))}
        </div>
      )}

      {expanded && (
        <div className="grid gap-1.5 sm:grid-cols-2">
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
