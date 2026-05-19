import Link from 'next/link'

import {
  Archive,
  Clock3,
  ExternalLink,
  FileText,
  Globe2,
  Search
} from 'lucide-react'

import { getWorkspaceKnowledgeData } from '@/lib/actions/platform-dashboard'
import { requireFeatureAccess } from '@/lib/auth/app-access'

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
    day: 'numeric',
    year: 'numeric'
  })
}

function matchesQuery(values: Array<string | null | undefined>, query: string) {
  if (!query) return true
  const normalizedQuery = query.toLowerCase()
  return values.some(value => value?.toLowerCase().includes(normalizedQuery))
}

function getStatusVariant(status: string) {
  if (status === 'failed' || status === 'cancelled') return 'destructive'
  if (status === 'succeeded') return 'secondary'
  return 'default'
}

export default async function LibraryPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; space?: string }>
}) {
  await requireFeatureAccess('/library', 'search')
  const data = await getWorkspaceKnowledgeData()
  const params = await searchParams
  const query = params.q?.trim() ?? ''
  const selectedSpace = params.space?.trim() ?? 'all'
  const validSpaceIds = new Set(data.spaces.map(space => space.id))
  const activeSpace = validSpaceIds.has(selectedSpace) ? selectedSpace : 'all'
  const spaceMatches = (space: string) =>
    activeSpace === 'all' || space === activeSpace
  const filteredThreads = data.threads.filter(
    thread =>
      spaceMatches(thread.space) &&
      matchesQuery([thread.title, thread.visibility], query)
  )
  const filteredSources = data.sourceDomains.filter(
    source =>
      spaceMatches(source.space) &&
      matchesQuery(
        [
          source.domain,
          source.latestTitle,
          source.latestUrl,
          source.latestChatTitle
        ],
        query
      )
  )
  const filteredTasks = data.tasks.filter(
    task =>
      spaceMatches(task.space) &&
      matchesQuery([task.title, task.kind, task.status, task.error], query)
  )
  const hasFilters = Boolean(query) || activeSpace !== 'all'

  return (
    <div className="dashboard-shell min-h-svh px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-3 rounded-lg border bg-background/90 p-5 shadow-sm sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Badge variant="outline" className="mb-3">
              Knowledge Library
            </Badge>
            <h1 className="text-3xl font-semibold tracking-normal">Library</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Saved threads, citations, files, and reusable research context
              from your actual Brok workspace.
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-muted"
          >
            New search
          </Link>
        </header>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <Metric label="Threads" value={data.totals.threads} />
          <Metric label="Sources" value={data.totals.sources} />
          <Metric label="Files" value={data.totals.files} />
          <Metric label="Shared" value={data.totals.publicThreads} />
          <Metric label="Active tasks" value={data.totals.activeTasks} />
          <Metric label="Task ledger" value={data.totals.tasks} />
        </section>

        <form
          action="/library"
          className="grid gap-3 rounded-lg border bg-background/90 p-4 shadow-sm md:grid-cols-[1fr_220px_auto]"
        >
          <label className="relative block">
            <span className="sr-only">Search library</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              name="q"
              type="search"
              defaultValue={query}
              placeholder="Search threads, sources, and task ledger"
              className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground/40"
            />
          </label>
          <label>
            <span className="sr-only">Filter by space</span>
            <select
              name="space"
              defaultValue={activeSpace}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors focus:border-foreground/40"
            >
              <option value="all">All spaces</option>
              {data.spaces.map(space => (
                <option key={space.id} value={space.id}>
                  {space.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-muted"
            >
              Filter
            </button>
            {hasFilters ? (
              <Link
                href="/library"
                className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-muted"
              >
                Reset
              </Link>
            ) : null}
          </div>
        </form>

        <section className="grid gap-5 xl:grid-cols-[1.45fr_0.9fr]">
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="text-lg">Saved Threads</CardTitle>
              <CardDescription>
                {filteredThreads.length.toLocaleString()} matching saved
                threads, ordered by latest message activity.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredThreads.length === 0 ? (
                <EmptyState
                  title={
                    hasFilters ? 'No matching threads' : 'No saved threads yet'
                  }
                  description={
                    hasFilters
                      ? 'Try a broader query or select all spaces.'
                      : 'Run a search or chat while signed in and it will appear here automatically.'
                  }
                />
              ) : (
                <div className="divide-y rounded-md border">
                  {filteredThreads.slice(0, 24).map(thread => (
                    <Link
                      key={thread.id}
                      href={thread.href}
                      className="grid gap-3 p-4 transition-colors hover:bg-muted/45 md:grid-cols-[1fr_auto]"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="truncate text-sm font-semibold">
                            {thread.title}
                          </h2>
                          <Badge
                            variant={
                              thread.visibility === 'public'
                                ? 'default'
                                : 'secondary'
                            }
                            className="capitalize"
                          >
                            {thread.visibility}
                          </Badge>
                          <Badge variant="outline" className="capitalize">
                            {thread.space}
                          </Badge>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Clock3 className="size-3.5" />
                            {formatDate(thread.lastActivityAt)}
                          </span>
                          <span>{thread.messageCount} messages</span>
                          <span>{thread.sourceCount} sources</span>
                          <span>{thread.fileCount} files</span>
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                        Open <ExternalLink className="size-3.5" />
                      </span>
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
                  <Globe2 className="size-4" />
                  Source Domains
                </CardTitle>
                <CardDescription>
                  Domains repeatedly cited across your saved work.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {filteredSources.length === 0 ? (
                  <EmptyState
                    title={
                      hasFilters
                        ? 'No matching sources'
                        : 'No cited sources yet'
                    }
                    description={
                      hasFilters
                        ? 'Try a broader query or select all spaces.'
                        : 'Search answers with web sources will populate this list.'
                    }
                  />
                ) : (
                  <div className="space-y-3">
                    {filteredSources.slice(0, 10).map(source => (
                      <Link
                        key={source.domain}
                        href={`/search/${source.latestChatId}`}
                        className="block rounded-md border p-3 transition-colors hover:bg-muted/45"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate text-sm font-medium">
                            {source.domain}
                          </p>
                          <Badge variant="outline">{source.count}</Badge>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {source.latestTitle}
                        </p>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Archive className="size-4" />
                  Collections
                </CardTitle>
                <CardDescription>
                  Current collections are inferred from the workspace surfaces
                  already in use.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3">
                  {data.spaces.map(space => (
                    <Link
                      key={space.id}
                      href="/spaces"
                      className="rounded-md border p-3 transition-colors hover:bg-muted/45"
                    >
                      <p className="font-medium">{space.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {space.threadCount} threads · {space.sourceCount}{' '}
                        sources · {space.fileCount} files
                      </p>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="text-lg">Background Task Ledger</CardTitle>
            <CardDescription>
              {filteredTasks.length.toLocaleString()} matching queued, running,
              completed, failed, and cancelled background tasks.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filteredTasks.length === 0 ? (
              <EmptyState
                title={hasFilters ? 'No matching tasks' : 'No task ledger yet'}
                description={
                  hasFilters
                    ? 'Try a broader query or select all spaces.'
                    : 'Long-running chat and BrokCode work will appear here once created.'
                }
              />
            ) : (
              <div className="divide-y rounded-md border">
                {filteredTasks.map(task => (
                  <div
                    key={task.id}
                    className="grid gap-3 p-4 text-sm md:grid-cols-[1fr_auto]"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium">{task.title}</p>
                        <Badge variant="outline" className="capitalize">
                          {task.space}
                        </Badge>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {task.kind} · created {formatDate(task.createdAt)} ·
                        updated {formatDate(task.updatedAt)}
                      </p>
                      {task.error ? (
                        <p className="mt-2 line-clamp-2 text-xs text-destructive">
                          {task.error}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-start gap-2 md:justify-end">
                      <Badge
                        variant={getStatusVariant(task.status)}
                        className="capitalize"
                      >
                        {task.status}
                      </Badge>
                      {task.chatId ? (
                        <Link
                          href={`/search/${task.chatId}`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                        >
                          Thread <ExternalLink className="size-3.5" />
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-background/90 p-4 shadow-sm">
      <p className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold">{value.toLocaleString()}</p>
    </div>
  )
}

function EmptyState({
  title,
  description
}: {
  title: string
  description: string
}) {
  return (
    <div className="rounded-md border border-dashed p-6 text-center">
      <FileText className="mx-auto mb-3 size-5 text-muted-foreground" />
      <p className="font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        {description}
      </p>
    </div>
  )
}
