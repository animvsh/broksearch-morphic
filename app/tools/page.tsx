import type { Metadata } from 'next'
import Link from 'next/link'

import { ArrowRight, PenLine, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'

export const metadata: Metadata = {
  title: 'Brok Tools',
  description:
    'Production-ready Brok tools for writing, research, code, email, and connected workflows.'
}

export default function ToolsPage() {
  return (
    <div className="dashboard-shell min-h-full w-full p-3 sm:p-4">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <section className="dashboard-panel px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-xs text-muted-foreground">
                <Sparkles className="size-3.5" />
                Tools
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Brok Tools
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Focused utilities that run as real product surfaces, not demo
                shells.
              </p>
            </div>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <div className="mb-2 flex size-10 items-center justify-center rounded-lg border bg-muted/40">
                <PenLine className="size-5" />
              </div>
              <CardTitle>AI Humanizer</CardTitle>
              <CardDescription>
                Rewrite AI-sounding text into cleaner, more natural prose with
                pattern detection and optional voice matching.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full gap-2">
                <Link href="/tools/humanizer">
                  Open Humanizer
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
