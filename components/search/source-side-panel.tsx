'use client'

import { ExternalLink, Quote } from 'lucide-react'

import type { SearchResultItem } from '@/lib/types'

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'

import type { SourceCardData } from '@/components/search/source-card'

function getHostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'source'
  }
}

function getPublishedAt(source: SearchResultItem | SourceCardData) {
  if ('publishedAt' in source && source.publishedAt) return source.publishedAt

  const raw =
    'publishedDate' in source
      ? source.publishedDate || source.date || source.retrievedAt
      : undefined
  if (!raw) return undefined

  const date = raw instanceof Date ? raw : new Date(raw)
  if (Number.isNaN(date.getTime())) return undefined

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

export function SourceSidePanel({
  source,
  open,
  onOpenChange
}: {
  source: SearchResultItem | SourceCardData | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  if (!source) return null

  const host =
    'publisher' in source && source.publisher
      ? source.publisher
      : 'domain' in source
        ? source.domain
        : getHostname(source.url)
  const excerpt =
    source.snippet || ('content' in source ? source.content : undefined)
  const publishedAt = getPublishedAt(source)
  const title = source.title || host

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full max-w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[26rem]"
      >
        <SheetHeader className="border-b border-border/60 px-4 py-3 pr-11 text-left">
          <SheetTitle className="break-words text-base leading-snug">
            {title}
          </SheetTitle>
          <SheetDescription className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
            <span className="max-w-full break-all">{host}</span>
            {publishedAt && (
              <>
                <span aria-hidden className="text-muted-foreground/50">
                  ·
                </span>
                <span className="shrink-0">{publishedAt}</span>
              </>
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {excerpt && (
            <section className="space-y-2">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Quote className="size-3.5" />
                Excerpt
              </div>
              <p className="max-h-[45vh] overflow-y-auto break-words rounded-md border border-border/60 bg-muted/25 p-3 text-sm leading-6 text-foreground/85">
                {excerpt}
              </p>
            </section>
          )}
        </div>

        <div className="border-t border-border/60 p-4">
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Open original source: ${title}`}
          >
            Open original
            <ExternalLink className="size-3.5" />
          </a>
        </div>
      </SheetContent>
    </Sheet>
  )
}
