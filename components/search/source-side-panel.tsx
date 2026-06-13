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
  source: SearchResultItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  if (!source) return null

  const host = source.publisher || getHostname(source.url)
  const excerpt = source.snippet || source.content

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="pr-8">
          <SheetTitle className="text-base leading-snug">
            {source.title || host}
          </SheetTitle>
          <SheetDescription>{host}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          {excerpt && (
            <section className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Quote className="size-3.5" />
                Relevant excerpt
              </div>
              <p className="rounded-lg border border-border/70 bg-muted/30 p-3 text-sm leading-relaxed text-foreground/85">
                {excerpt}
              </p>
            </section>
          )}

          <section className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <ShieldCheck className="size-3.5" />
              Why Brok used this
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              This source was returned by the research pipeline and linked to
              the cited answer so you can verify the claim against the original
              page.
            </p>
          </section>

          <a
            href={source.url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            Open original
            <ExternalLink className="size-3.5" />
          </a>
        </div>
      </SheetContent>
    </Sheet>
  )
}
