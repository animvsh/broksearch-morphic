'use client'

import { useState } from 'react'
import Link from 'next/link'

import { SearchResultItem } from '@/lib/types'
import { displayUrlName } from '@/lib/utils/domain'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export interface SearchResultsProps {
  results: SearchResultItem[]
  displayMode?: 'grid' | 'list'
}

function getResultHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'source'
  }
}

function getResultTitle(result: SearchResultItem) {
  return result.title || displayUrlName(result.url) || 'Source'
}

export function SearchResults({
  results,
  displayMode = 'grid'
}: SearchResultsProps) {
  // State to manage whether to display the results
  const [showAllResults, setShowAllResults] = useState(false)

  const handleViewMore = () => {
    setShowAllResults(true)
  }

  // Logic for grid mode
  const displayedGridResults = showAllResults ? results : results.slice(0, 3)
  const additionalResultsCount = results.length > 3 ? results.length - 3 : 0

  // --- List Mode Rendering ---
  if (displayMode === 'list') {
    return (
      <div className="flex flex-col gap-2">
        {results.map((result, index) => {
          const host = getResultHost(result.url)
          return (
            <Link
              href={result.url}
              key={index}
              passHref
              target="_blank"
              className="block"
            >
              <Card className="w-full border-border/70 hover:bg-muted/50 transition-colors">
                <CardContent className="p-3 flex items-start gap-3">
                  <div className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium">
                    {index + 1}
                  </div>
                  <Avatar className="h-4 w-4 mt-1 shrink-0">
                    <AvatarImage
                      src={`https://www.google.com/s2/favicons?domain=${host}`}
                      alt={host}
                    />
                    <AvatarFallback className="text-xs">
                      {host[0]?.toUpperCase() || '?'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grow overflow-hidden space-y-0.5">
                    <p className="text-sm font-medium line-clamp-1">
                      {getResultTitle(result)}
                    </p>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {result.content}
                    </p>
                    <div className="text-xs text-muted-foreground/80 mt-1 truncate">
                      <span className="underline">{host}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>
    )
  }

  // --- Grid Mode Rendering (Existing Logic) ---
  return (
    <div className="flex flex-wrap -m-1">
      {displayedGridResults.map((result, index) => {
        const host = getResultHost(result.url)
        return (
          <div className="w-1/2 md:w-1/4 p-1 min-w-0" key={index}>
            <Link
              href={result.url}
              passHref
              target="_blank"
              className="group block h-full"
            >
              <Card className="flex-1 h-full transition-all duration-200 group-hover:scale-[1.02] group-hover:bg-muted/70 group-hover:shadow-md group-hover:border-primary/20">
                <CardContent className="p-3 flex flex-col justify-between h-full min-w-0 gap-2 transition-opacity duration-200">
                  <div className="flex items-start gap-2">
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-medium">
                      {index + 1}
                    </span>
                    <p className="text-xs font-medium line-clamp-2 min-h-8">
                      {getResultTitle(result)}
                    </p>
                  </div>
                  <p className="text-[11px] leading-relaxed text-muted-foreground line-clamp-2">
                    {result.content}
                  </p>
                  <div className="mt-2 flex items-center space-x-1 min-w-0">
                    <Avatar className="h-4 w-4 shrink-0">
                      <AvatarImage
                        src={`https://www.google.com/s2/favicons?domain=${host}`}
                        alt={host}
                      />
                      <AvatarFallback>
                        {host[0]?.toUpperCase() || '?'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="text-xs opacity-60 truncate min-w-0 group-hover:opacity-80 transition-opacity duration-200">
                      {displayUrlName(result.url)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>
        )
      })}
      {!showAllResults && additionalResultsCount > 0 && (
        <div className="w-1/2 md:w-1/4 p-1">
          <Card className="flex-1 flex h-full items-center justify-center transition-all duration-200 hover:scale-[1.02] hover:bg-muted/70">
            <CardContent className="p-2">
              <Button
                variant={'link'}
                className="text-muted-foreground transition-colors duration-200 group-hover:text-primary"
                onClick={handleViewMore}
              >
                View {additionalResultsCount} more
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
