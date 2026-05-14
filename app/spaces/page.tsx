import Link from 'next/link'

import { FolderKanban, Loader2, MessageSquareText } from 'lucide-react'

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
  if (!value) return 'No activity'
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

export default async function SpacesPage() {
  const data = await getWorkspaceKnowledgeData()

  return (
    <div className="dashboard-shell min-h-svh px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="rounded-lg border bg-background/90 p-5 shadow-sm">
          <Badge variant="outline" className="mb-3">
            Spaces
          </Badge>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-normal">
                Research Spaces
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Workspace areas are now backed by your saved threads, cited
                sources, uploaded files, and running task ledger.
              </p>
            </div>
            <Link
              href="/library"
              className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-muted"
            >
              Open library
            </Link>
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-2">
          {data.spaces.map(space => (
            <Card key={space.id} className="rounded-lg">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <FolderKanban className="size-4" />
                      {space.name}
                    </CardTitle>
                    <CardDescription className="mt-2">
                      {space.description}
                    </CardDescription>
                  </div>
                  <Badge variant="secondary">{space.threadCount} threads</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-4 grid grid-cols-3 gap-2 text-sm">
                  <SpaceMetric label="Sources" value={space.sourceCount} />
                  <SpaceMetric label="Files" value={space.fileCount} />
                  <SpaceMetric label="Tasks" value={space.taskCount} />
                </div>
                <p className="mb-3 text-xs font-medium uppercase text-muted-foreground">
                  Latest work · {formatDate(space.latestAt)}
                </p>
                {space.threads.length === 0 ? (
                  <div className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">
                    No saved work in this space yet. Threads are assigned here
                    automatically based on their title and activity.
                  </div>
                ) : (
                  <div className="divide-y rounded-md border">
                    {space.threads.map(thread => (
                      <Link
                        key={thread.id}
                        href={thread.href}
                        className="flex items-center justify-between gap-4 p-3 transition-colors hover:bg-muted/45"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {thread.title}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {thread.messageCount} messages ·{' '}
                            {thread.sourceCount} sources
                          </p>
                        </div>
                        <MessageSquareText className="size-4 shrink-0 text-muted-foreground" />
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </section>

        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Loader2 className="size-4" />
              Active Workspace Tasks
            </CardTitle>
            <CardDescription>
              Background ledger entries that are queued or running for the
              current account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.activeTasks.length === 0 ? (
              <div className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">
                No active tasks. Long-running chat and BrokCode work will appear
                here while it is queued or running.
              </div>
            ) : (
              <div className="divide-y rounded-md border">
                {data.activeTasks.map(task => (
                  <div
                    key={task.id}
                    className="grid gap-2 p-3 text-sm md:grid-cols-[1fr_auto]"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{task.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {task.kind} · updated {formatDate(task.updatedAt)}
                      </p>
                    </div>
                    <Badge>{task.status}</Badge>
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

function SpaceMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-background/70 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value.toLocaleString()}</p>
    </div>
  )
}
