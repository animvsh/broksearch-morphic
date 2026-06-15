import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Clock3,
  Folder,
  Globe2,
  Link2,
  Lock,
  type LucideIcon,
  Mail,
  MessageCircle,
  Search,
  Shield,
  Users
} from 'lucide-react'

import {
  getSpaceData,
  type SpaceRole,
  type SpaceVisibility
} from '@/lib/actions/platform-dashboard'
import { requireFeatureAccess } from '@/lib/auth/app-access'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'

export const dynamic = 'force-dynamic'

const ROLE_LABELS: Record<SpaceRole, string> = {
  owner: 'Owner',
  editor: 'Editor',
  viewer: 'Viewer'
}

const VISIBILITY_ICON_MAP: Record<SpaceVisibility, LucideIcon> = {
  public: Globe2,
  link: Link2,
  private: Lock
}

function formatRelative(value: Date | null) {
  if (!value) return 'Never'
  const now = Date.now()
  const diff = now - new Date(value).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric'
  }).format(new Date(value))
}

function visibilityLabel(visibility: SpaceVisibility) {
  if (visibility === 'public') return 'Public'
  if (visibility === 'link') return 'Link sharing'
  return 'Private'
}

function plural(value: number, singular: string, pluralLabel = `${singular}s`) {
  return `${value} ${value === 1 ? singular : pluralLabel}`
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  )
}

export default async function SpaceDetailPage({
  params
}: {
  params: Promise<{ spaceId: string }>
}) {
  const user = await requireFeatureAccess('/spaces', 'search')
  if (!user) {
    redirect(`/auth/login?redirectTo=${encodeURIComponent('/spaces')}`)
  }

  const { spaceId } = await params
  if (!isUuid(spaceId)) {
    redirect('/spaces')
  }

  const data = await getSpaceData(spaceId)
  if (!data) {
    notFound()
  }

  const VisibilityIcon = VISIBILITY_ICON_MAP[data.space.visibility]
  const ownerCount = data.members.filter(
    member => member.role === 'owner'
  ).length
  const editorCount = data.members.filter(
    member => member.role === 'editor'
  ).length
  const viewerCount = data.members.filter(
    member => member.role === 'viewer'
  ).length
  const activeMembers = data.members.filter(member => member.lastActiveAt)
  const savedWorkCount =
    data.totals.projects + data.totals.threads + data.space.presentationCount

  return (
    <div className="dashboard-shell min-h-svh px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <div className="flex flex-col gap-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <Button asChild variant="ghost" size="sm" className="w-fit gap-1">
            <Link href="/spaces">
              <ArrowLeft className="size-3.5" />
              All spaces
            </Link>
          </Button>
          <div className="flex items-center gap-1.5">
            <Clock3 className="size-3.5" />
            <span>Last activity</span>
            <span className="font-medium text-foreground">
              {formatRelative(data.space.lastActivityAt)}
            </span>
          </div>
        </div>

        <header className="overflow-hidden rounded-xl border bg-background shadow-sm">
          <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="min-w-0">
              <div className="flex items-start gap-3">
                <span
                  className="flex size-12 shrink-0 items-center justify-center rounded-lg text-base font-semibold text-white"
                  style={{
                    backgroundColor: data.space.iconColor ?? '#1f2937'
                  }}
                >
                  {data.space.name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="gap-2 bg-background">
                      <VisibilityIcon className="size-3" />
                      {visibilityLabel(data.space.visibility)}
                    </Badge>
                    <Badge variant="secondary">
                      {ROLE_LABELS[data.space.role]}
                    </Badge>
                  </div>
                  <h1 className="break-words text-3xl font-semibold tracking-normal sm:text-4xl">
                    {data.space.name}
                  </h1>
                  <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
                    /{data.space.slug}
                  </p>
                </div>
              </div>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                {data.space.description ??
                  'A shared place for source-grounded threads, projects, and presentations attached to this space.'}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row lg:justify-end">
              <Button asChild variant="outline" className="gap-2">
                <Link href="/library">
                  <BookOpen className="size-4" />
                  Library
                </Link>
              </Button>
              <Button asChild className="gap-2">
                <Link href="/search">
                  <Search className="size-4" />
                  Search
                </Link>
              </Button>
            </div>
          </div>
          <div className="grid border-t bg-muted/25 sm:grid-cols-4">
            <Metric
              label="Members"
              value={data.totals.members.toString()}
              icon={Users}
            />
            <Metric
              label="Projects"
              value={data.totals.projects.toString()}
              icon={Folder}
            />
            <Metric
              label="Threads"
              value={data.totals.threads.toString()}
              icon={MessageCircle}
            />
            <Metric
              label="Pending invites"
              value={data.totals.invites.toString()}
              icon={Mail}
            />
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="min-w-0 space-y-4">
            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="text-base">Space work</CardTitle>
                  <CardDescription>
                    Projects and saved threads attached to this space.
                  </CardDescription>
                </div>
                <Badge variant="secondary" className="w-fit">
                  {plural(savedWorkCount, 'saved item')}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-medium">Projects</h2>
                    <span className="text-xs text-muted-foreground">
                      {plural(data.projects.length, 'project')}
                    </span>
                  </div>
                  {data.projects.length === 0 ? (
                    <EmptyProjects />
                  ) : (
                    <div className="grid gap-2">
                      {data.projects.map(project => (
                        <div
                          key={project.id}
                          className="flex flex-col gap-3 rounded-md border bg-background p-3 sm:flex-row sm:items-center"
                        >
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/40">
                            <Folder className="size-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {project.title}
                            </p>
                            <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
                              {project.description ?? 'No description yet.'}
                            </p>
                          </div>
                          <div className="flex items-center justify-between gap-2 sm:flex-col sm:items-end">
                            <Badge variant="outline" className="text-[10px]">
                              {project.status}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatRelative(project.updatedAt)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-medium">Recent threads</h2>
                    <span className="text-xs text-muted-foreground">
                      {plural(data.recentThreads.length, 'thread')}
                    </span>
                  </div>
                  {data.recentThreads.length === 0 ? (
                    <EmptyThreads />
                  ) : (
                    <div className="grid gap-2">
                      {data.recentThreads.map(thread => (
                        <Link
                          key={thread.id}
                          href={thread.href}
                          className="group flex flex-col gap-3 rounded-md border bg-background p-3 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center"
                        >
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/40">
                            <MessageCircle className="size-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {thread.title}
                            </p>
                            <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
                              {thread.summary ?? thread.model ?? 'Untitled'}
                            </p>
                          </div>
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            {formatRelative(thread.updatedAt)}
                            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Members</CardTitle>
                <CardDescription>
                  {plural(data.totals.members, 'member')} ·{' '}
                  {plural(ownerCount, 'owner')} ·{' '}
                  {plural(editorCount, 'editor')} ·{' '}
                  {plural(viewerCount, 'viewer')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {data.members.length === 0 ? (
                  <p className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                    No members are recorded for this space yet.
                  </p>
                ) : (
                  data.members.map(member => (
                    <div
                      key={member.id}
                      className="flex items-center gap-3 rounded-md border bg-background p-2.5"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted/40 text-xs font-semibold">
                        {(member.displayName ?? member.email ?? member.userId)
                          .charAt(0)
                          .toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {member.displayName ?? member.email ?? member.userId}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {ROLE_LABELS[member.role]} ·{' '}
                          {formatRelative(member.lastActiveAt)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Invites and sharing</CardTitle>
                <CardDescription>
                  Pending invitations from the space data model.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <div className="rounded-md border bg-background p-2.5 text-xs text-muted-foreground">
                  <Badge variant="outline" className="mb-2 gap-1 text-[10px]">
                    <VisibilityIcon className="size-3" />
                    {visibilityLabel(data.space.visibility)}
                  </Badge>
                  <p>
                    Invite and visibility management actions are not exposed on
                    this page yet.
                  </p>
                </div>
                {data.invites.length === 0 ? (
                  <p className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                    No pending invites.
                  </p>
                ) : (
                  data.invites.map(invite => (
                    <div
                      key={invite.id}
                      className="flex items-center gap-3 rounded-md border bg-background p-2.5"
                    >
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted/40">
                        <Mail className="size-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{invite.email}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {ROLE_LABELS[invite.role]}
                        </p>
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        {formatRelative(invite.createdAt)}
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Recent activity</CardTitle>
                <CardDescription>
                  Member activity recorded for this space.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {activeMembers.length === 0 ? (
                  <p className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                    No recent member activity yet.
                  </p>
                ) : (
                  activeMembers.slice(0, 4).map(member => (
                    <div
                      key={member.id}
                      className="flex items-center gap-2 text-xs"
                    >
                      <Clock3 className="size-3 shrink-0 text-muted-foreground" />
                      <span className="truncate font-medium">
                        {member.displayName ?? member.email ?? member.userId}
                      </span>
                      <span className="ml-auto shrink-0 text-muted-foreground">
                        {formatRelative(member.lastActiveAt)}
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </aside>
        </section>
      </div>
    </div>
  )
}

function Metric({
  icon: Icon,
  label,
  value
}: {
  icon: LucideIcon
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-3 border-b p-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-background shadow-sm ring-1 ring-border">
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div>
        <p className="text-2xl font-semibold leading-none">{value}</p>
        <p className="mt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
      </div>
    </div>
  )
}

function EmptyProjects() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-md border bg-muted/30 p-6 text-center">
      <span className="flex size-9 items-center justify-center rounded-full border bg-background">
        <Folder className="size-4" />
      </span>
      <p className="text-sm font-medium">No projects yet</p>
      <p className="max-w-sm text-xs leading-5 text-muted-foreground">
        Projects will appear here when they are attached to this space.
      </p>
    </div>
  )
}

function EmptyThreads() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border bg-muted/30 p-6 text-center">
      <span className="flex size-9 items-center justify-center rounded-full border bg-background">
        <MessageCircle className="size-4" />
      </span>
      <div>
        <p className="text-sm font-medium">No saved threads yet</p>
        <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
          Start a search or open Library to find work that can be connected to
          this space when assignment is available.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button asChild size="sm">
          <Link href="/search">
            <Search className="mr-2 size-4" />
            Start search
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/library">
            <BookOpen className="mr-2 size-4" />
            Library
          </Link>
        </Button>
      </div>
    </div>
  )
}
