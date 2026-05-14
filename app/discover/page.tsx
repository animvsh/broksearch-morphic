import Link from 'next/link'

import { ArrowUpRight, Clock3, Compass, Search, Sparkles } from 'lucide-react'

import { getWorkspaceKnowledgeData } from '@/lib/actions/platform-dashboard'

import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'

export const dynamic = 'force-dynamic'

function formatDate(value: Date | string | null) {
  if (!value) return 'No activity yet'
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  })
}

function makePrompt(title: string) {
  const normalized = title.replace(/\s+/g, ' ').trim()
  if (!normalized) return 'Continue my latest research'
  return `Continue researching ${normalized}`
}

export default async function DiscoverPage() {
  const data = await getWorkspaceKnowledgeData()
  const featuredThreads = data.threads.slice(0, 8)
  const prompts = [
    ...featuredThreads.slice(0, 4).map(thread => makePrompt(thread.title)),
    'Summarize my most important saved sources',
    'Find follow-up questions from my recent threads'
  ]

  return (
    <div className="dashboard-shell min-h-svh px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="rounded-lg border bg-background/90 p-5 shadow-sm">
          <Badge variant="outline" className="mb-3">
            Discover
          </Badge>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-normal">
                Discover Workspace
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                A live feed of recent research, reusable prompts, active spaces,
                and source patterns from your Brok activity.
              </p>
            </div>
            <Link
              href="/"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Search className="size-4" />
              Search
            </Link>
          </div>
        </header>

        <section className="grid gap-5 xl:grid-cols-[1.25fr_0.95fr]">
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Compass className="size-4" />
                Recent Research
              </CardTitle>
              <CardDescription>
                Threads you can reopen, continue, share, or use as context.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {featuredThreads.length === 0 ? (
                <EmptyState text="Start a search and Discover will become your workspace activity feed." />
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {featuredThreads.map(thread => (
                    <Link
                      key={thread.id}
                      href={thread.href}
                      className="rounded-md border p-4 transition-colors hover:bg-muted/45"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h2 className="line-clamp-2 text-sm font-semibold leading-5">
                          {thread.title}
                        </h2>
                        <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Clock3 className="size-3.5" />
                          {formatDate(thread.lastActivityAt)}
                        </span>
                        <span>{thread.sourceCount} sources</span>
                        <span>{thread.toolCount} tools</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-5">
            <Card className="rounded-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Sparkles className="size-4" />
                  Suggested Prompts
                </CardTitle>
                <CardDescription>
                  Generated from your current workspace, not static demo copy.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {prompts.map(prompt => (
                    <Link
                      key={prompt}
                      href={`/?q=${encodeURIComponent(prompt)}`}
                      className="rounded-md border bg-background px-3 py-2 text-sm transition-colors hover:bg-muted/45"
                    >
                      {prompt}
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-lg">
              <CardHeader>
                <CardTitle className="text-lg">Top Sources</CardTitle>
                <CardDescription>
                  The sites Brok has actually used in your research.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.sourceDomains.length === 0 ? (
                  <EmptyState text="Cited web answers will surface source domains here." />
                ) : (
                  <div className="space-y-2">
                    {data.sourceDomains.slice(0, 8).map(source => (
                      <Link
                        key={source.domain}
                        href={`/search/${source.latestChatId}`}
                        className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted/45"
                      >
                        <span className="truncate">{source.domain}</span>
                        <Badge variant="outline">{source.count}</Badge>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {data.spaces.map(space => (
            <Link
              key={space.id}
              href="/spaces"
              className="rounded-lg border bg-background/90 p-4 shadow-sm transition-colors hover:bg-muted/45"
            >
              <p className="font-semibold">{space.name}</p>
              <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                {space.description}
              </p>
              <p className="mt-4 text-xs text-muted-foreground">
                {space.threadCount} threads · latest{' '}
                {formatDate(space.latestAt)}
              </p>
            </Link>
          ))}
        </section>
      </div>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
      {text}
    </div>
  )
}
