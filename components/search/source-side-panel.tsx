'use client'

import { ExternalLink, Quote, ShieldCheck } from 'lucide-react'

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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="space-y-1 pr-8">
          <SheetTitle className="text-base leading-snug">
            {source.title || host}
          </SheetTitle>
          <SheetDescription className="truncate">{host}</SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-4">
          {excerpt && (
            <section className="space-y-1.5">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Quote className="size-3.5" />
                Excerpt
              </div>
              <p className="max-h-52 overflow-y-auto rounded-lg border border-border/70 bg-muted/25 p-3 text-sm leading-6 text-foreground/85">
                {excerpt}
              </p>
            </section>
          )}

          <section className="rounded-lg border border-border/60 bg-card/60 p-3">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <ShieldCheck className="size-3.5" />
              Verification
            </div>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Kept with this answer so you can compare the cited claim with the
              original page.
            </p>
          </section>

          <a
            href={source.url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex h-11 items-center gap-2 rounded-md border border-border px-4 text-sm font-medium transition-colors hover:bg-muted"
          >
            Open original
            <ExternalLink className="size-3.5" />
          </a>
        </div>
      </SheetContent>
    </Sheet>
  )
}
