'use client'

import Link from 'next/link'

import { ExternalLink, Globe2 } from 'lucide-react'

import type { SearchResultItem } from '@/lib/types'
import { displayUrlName } from '@/lib/utils/domain'

import { Badge } from './ui/badge'

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
    <div className="-mx-1 flex max-w-full gap-2 overflow-x-auto px-1 pb-2 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {sources.map((source, index) => (
        <Link
          key={source.url}
          href={source.url}
          target="_blank"
          rel="noreferrer noopener"
          className="group min-w-0 shrink-0"
        >
          <Badge
            variant="secondary"
            className="h-8 max-w-[240px] gap-2 rounded-full border border-border/70 bg-background px-3 text-xs shadow-xs transition-all duration-200 group-hover:border-primary/30 group-hover:bg-primary/10 group-hover:shadow-sm"
          >
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-medium text-foreground">
              {index + 1}
            </span>
            <Globe2 className="size-3 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:rotate-12" />
            <span className="truncate font-medium">
              {source.title || displayUrlName(source.url)}
            </span>
            <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
          </Badge>
        </Link>
      ))}
    </div>
  )
}
