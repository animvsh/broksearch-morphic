'use client'

import Link from 'next/link'

import { ExternalLink } from 'lucide-react'

import type { SearchResultItem } from '@/lib/types'
import { cn } from '@/lib/utils'
import { displayUrlName } from '@/lib/utils/domain'

import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar'

function getTopSources(
  citationMaps: Record<string, Record<number, SearchResultItem>>,
  limit = 6
): SearchResultItem[] {
  const unique = new Map<string, SearchResultItem>()
  const hostCounts = new Map<string, number>()

  for (const citationMap of Object.values(citationMaps)) {
    for (const citation of Object.values(citationMap)) {
      const sourceKey = getSourceKey(citation?.url)
      if (!citation?.url || !sourceKey || unique.has(sourceKey.key)) {
        continue
      }

      const currentHostCount = hostCounts.get(sourceKey.host) ?? 0
      if (currentHostCount >= 2) {
        continue
      }
      hostCounts.set(sourceKey.host, currentHostCount + 1)
      unique.set(sourceKey.key, citation)
      if (unique.size >= limit) {
        return Array.from(unique.values())
      }
    }
  }

  return Array.from(unique.values())
}

function getSourceKey(url?: string) {
  if (!url) return null

  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase()
    const path = parsed.pathname.replace(/\/$/, '').toLowerCase()
    return {
      host,
      key: `${host}${path}`
    }
  } catch {
    return null
  }
}

function getSourceHost(url?: string) {
  if (!url) return 'source'

  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return 'source'
  }
}

function getSourceDate(source: SearchResultItem) {
  const raw =
    source.publishedDate ?? source.date ?? source.retrievedAt ?? undefined
  if (!raw) return null

  const date = raw instanceof Date ? raw : new Date(raw)
  if (Number.isNaN(date.getTime())) return null

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(date)
}

function getSourceSnippet(source: SearchResultItem) {
  return source.snippet || source.content || 'Open source for more detail.'
}

export function getSourceCardMetadata(source: SearchResultItem) {
  const host = source.publisher || getSourceHost(source.url)

  return {
    title: source.title || displayUrlName(source.url) || 'Source',
    host,
    date: getSourceDate(source),
    snippet: getSourceSnippet(source)
  }
}

export function SourceStrip({
  citationMaps
}: {
  citationMaps?: Record<string, Record<number, SearchResultItem>>
}) {
  if (!citationMaps || Object.keys(citationMaps).length === 0) {
    return null
  }

  const sources = getTopSources(citationMaps)
  if (sources.length === 0) {
    return null
  }

  return (
    <div
      className="-mx-1 flex max-w-full gap-2 overflow-x-auto px-1 pb-2 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      aria-label="Answer sources"
    >
      {sources.map((source, index) => {
        const metadata = getSourceCardMetadata(source)

        return (
          <Link
            key={source.url}
            href={source.url}
            target="_blank"
            rel="noreferrer noopener"
            className={cn(
              'group flex min-h-[116px] w-[260px] shrink-0 flex-col justify-between rounded-lg border border-border/70 bg-background p-3 text-left shadow-xs transition-all duration-200',
              'hover:border-primary/30 hover:bg-primary/5 hover:shadow-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring'
            )}
          >
            <div className="min-w-0">
              <div className="mb-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-medium text-foreground">
                  {index + 1}
                </span>
                <Avatar className="size-4 shrink-0">
                  <AvatarImage
                    src={`https://www.google.com/s2/favicons?domain=${metadata.host}`}
                    alt={metadata.host}
                  />
                  <AvatarFallback className="text-[9px]">
                    {metadata.host[0]?.toUpperCase() || '?'}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate">{metadata.host}</span>
                {metadata.date ? (
                  <>
                    <span className="shrink-0">·</span>
                    <span className="shrink-0">{metadata.date}</span>
                  </>
                ) : null}
              </div>
              <p className="line-clamp-2 text-sm font-medium leading-5 text-foreground">
                {metadata.title}
              </p>
              <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-muted-foreground">
                {metadata.snippet}
              </p>
            </div>
            <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors group-hover:text-primary">
              Open source
              <ExternalLink className="size-3" />
            </div>
          </Link>
        )
      })}
    </div>
  )
}
