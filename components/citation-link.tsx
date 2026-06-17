'use client'

import { memo, useState } from 'react'
import Link from 'next/link'

import type { SearchResultItem } from '@/lib/types'
import { cn } from '@/lib/utils'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover'

interface CitationLinkProps {
  href: string
  children: React.ReactNode
  className?: string
  citationData?: SearchResultItem
  onCitationOpen?: (citation: SearchResultItem) => void
}

// Helper function to safely extract hostname from URL
const getHostname = (url: string): string => {
  try {
    return new URL(url).hostname
  } catch {
    return 'unknown'
  }
}

export const CitationLink = memo(function CitationLink({
  href,
  children,
  className,
  citationData,
  onCitationOpen
}: CitationLinkProps) {
  const [open, setOpen] = useState(false)
  const childrenText = children?.toString() || ''
  // Match domain names (alphanumeric and hyphens) or numbers for backward compatibility
  const isCitation = /^[\w-]+$/.test(childrenText)
  const citationLabel = /^\d+$/.test(childrenText)
    ? `[${childrenText}]`
    : children

  const linkClasses = cn(
    isCitation
      ? 'not-prose mx-0.5 inline-flex h-4 min-w-4 -translate-y-px items-center justify-center rounded px-1 font-mono text-[10px] font-semibold leading-none whitespace-nowrap bg-foreground/[0.08] text-foreground/75 no-underline transition-colors hover:bg-foreground/15 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      : 'hover:underline inline-flex items-center gap-1.5',
    className
  )

  if (!citationData) {
    if (isCitation && href.startsWith('#')) {
      return <span className={linkClasses}>{citationLabel}</span>
    }

    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClasses}
      >
        {isCitation ? citationLabel : children}
      </a>
    )
  }

  // For citations with data, show popover on hover
  if (isCitation && citationData) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClasses}
            onClick={event => {
              if (onCitationOpen) {
                event.preventDefault()
                onCitationOpen(citationData)
                setOpen(false)
              }
            }}
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
            aria-label={`Source ${childrenText}: ${citationData.title}`}
            title={`Source ${childrenText}: ${citationData.title}`}
          >
            {citationLabel}
          </a>
        </PopoverTrigger>
        <PopoverContent
          className="z-50 w-[min(18rem,calc(100vw-2rem))] p-0 shadow-xs"
          side="bottom"
          align="start"
          sideOffset={4}
          collisionPadding={12}
        >
          {citationData ? (
            <Link
              href={citationData.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-3 transition-colors hover:bg-accent/50"
            >
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Avatar className="h-4 w-4 shrink-0">
                    <AvatarImage
                      src={`https://www.google.com/s2/favicons?domain=${getHostname(
                        citationData.url
                      )}`}
                      alt={getHostname(citationData.url)}
                    />
                    <AvatarFallback className="text-xs">
                      {getHostname(citationData.url)[0]?.toUpperCase() || '?'}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate text-xs text-muted-foreground">
                    {getHostname(citationData.url)}
                  </span>
                </div>
                <p className="line-clamp-2 break-words text-sm font-medium leading-snug">
                  {citationData.title}
                </p>
                <p className="line-clamp-2 break-words text-xs leading-relaxed text-muted-foreground">
                  {citationData.content}
                </p>
              </div>
            </Link>
          ) : null}
        </PopoverContent>
      </Popover>
    )
  }

  // For non-numbered citations, render as regular link
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={linkClasses}
    >
      {children}
    </a>
  )
})
