'use client'

import Link from 'next/link'

import { Globe2 } from 'lucide-react'

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
    <div className="-mx-1 flex flex-wrap items-center gap-2 px-1 pb-1">
      {sources.map(source => (
        <Link
          key={source.url}
          href={source.url}
          target="_blank"
          rel="noreferrer noopener"
          className="group"
        >
          <Badge
            variant="secondary"
            className="max-w-full gap-1.5 rounded-md px-2 py-1 text-xs transition-colors group-hover:bg-muted"
          >
            <Globe2 className="size-3" />
            <span className="truncate">{displayUrlName(source.url)}</span>
          </Badge>
        </Link>
      ))}
    </div>
  )
}
