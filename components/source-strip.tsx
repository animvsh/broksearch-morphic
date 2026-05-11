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

  for (const citationMap of Object.values(citationMaps)) {
    for (const citation of Object.values(citationMap)) {
      if (!citation?.url || unique.has(citation.url)) {
        continue
      }
      unique.set(citation.url, citation)
      if (unique.size >= limit) {
        return Array.from(unique.values())
      }
    }
  }

  return Array.from(unique.values())
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
