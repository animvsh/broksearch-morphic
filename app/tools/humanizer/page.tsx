import type { Metadata } from 'next'
import Link from 'next/link'

import { ArrowLeft, PenLine } from 'lucide-react'

import { Button } from '@/components/ui/button'

import { AiHumanizerTool } from '@/components/tools/ai-humanizer-tool'

export const metadata: Metadata = {
  title: 'AI Humanizer Tool | Brok',
  description:
    'Humanize AI-generated writing by removing common AI phrasing, inflated language, chatbot artifacts, and awkward formatting.'
}

export default function HumanizerPage() {
  return (
    <div className="dashboard-shell min-h-full w-full p-3 sm:p-4">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <section className="dashboard-panel px-4 py-4 sm:px-5">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="-ml-2 mb-3 gap-2"
          >
            <Link href="/tools">
              <ArrowLeft className="size-4" />
              Tools
            </Link>
          </Button>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-xs text-muted-foreground">
                <PenLine className="size-3.5" />
                Writing tool
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">
                AI Humanizer
              </h1>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Paste text, remove common AI-writing artifacts, and tune the
                rewrite with a sample of your own voice.
              </p>
            </div>
          </div>
        </section>

        <AiHumanizerTool />
      </div>
    </div>
  )
}
