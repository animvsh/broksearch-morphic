import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import {
  ArrowLeft,
  Clock3,
  Folder,
  Globe2,
  Link2,
  Lock,
  Mail,
  MessageCircle,
  Plus,
  Search,
  Settings,
  Share2,
  Shield,
  UserPlus,
  Users
} from 'lucide-react'

import { getSpaceData, type SpaceRole } from '@/lib/actions/platform-dashboard'
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

function visibilityIcon(visibility: 'private' | 'link' | 'public') {
  if (visibility === 'public') return Globe2
  if (visibility === 'link') return Link2
  return Lock
}

const VISIBILITY_ICON_MAP = {
  public: Globe2,
  link: Link2,
  private: Lock
} as const

function visibilityLabel(visibility: 'private' | 'link' | 'public') {
  if (visibility === 'public') return 'Public'
  if (visibility === 'link') return 'Link sharing'
  return 'Private'
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

  return (
    <div className="dashboard-shell min-h-svh px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <Button asChild variant="ghost" size="sm" className="gap-1">
            <Link href="/spaces">
              <ArrowLeft className="size-3.5" />
              All spaces
            </Link>
          </Button>
          <div className="flex items-center gap-1.5">
            <span>Last activity</span>
            <span className="font-medium text-foreground">
              {formatRelative(data.space.lastActivityAt)}
            </span>
          </div>
        </div>

        <header className="overflow-hidden rounded-xl border bg-background shadow-sm">
          <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <span
                  className="flex size-12 items-center justify-center rounded-lg text-base font-semibold text-white"
                  style={{
                    backgroundColor: data.space.iconColor ?? '#1f2937'
                  }}
                >
                  {data.space.name.charAt(0).toUpperCase()}
                </span>
                <div>
                  <Badge variant="outline" className="mb-1 gap-2 bg-background">
                    <VisibilityIcon className="size-3" />
                    {visibilityLabel(data.space.visibility)}
                  </Badge>
                  <h1 className="text-3xl font-semibold tracking-normal sm:text-4xl">
                    {data.space.name}
                  </h1>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    /{data.space.slug}
                  </p>
                </div>
              </div>
              {data.space.description ? (
                <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                  {data.space.description}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button disabled variant="outline" className="gap-2">
                <MessageCircle className="size-4" />
                Space chat
              </Button>
              <Button disabled className="gap-2">
                <Settings className="size-4" />
                Settings
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

        <section className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-base">Projects</CardTitle>
                  <CardDescription>
                    Project-specific research folders within this space.
                  </CardDescription>
                </div>
                <Button disabled size="sm" className="gap-1.5">
                  <Plus className="size-3.5" />
                  New project
                </Button>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {data.projects.length === 0 ? (
                  <EmptyProjects />
                ) : (
                  data.projects.map(project => (
                    <div
                      key={project.id}
                      className="flex items-center gap-3 rounded-md border bg-background p-3"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted/40">
                        <Folder className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {project.title}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {project.description ?? 'No description yet.'}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-[10px]">
                        {project.status}
                      </Badge>
                      <span className="hidden text-xs text-muted-foreground sm:inline">
                        {formatRelative(project.updatedAt)}
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-base">Recent threads</CardTitle>
                  <CardDescription>
                    Threads, chats, and presentations saved to this space.
                  </CardDescription>
                </div>
                <Button asChild size="sm" variant="outline" className="gap-1.5">
                  <Link href="/library">
                    <Search className="size-3.5" />
                    All library
                  </Link>
                </Button>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {data.recentThreads.length === 0 ? (
                  <p className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                    No items saved to this space yet. Save a search result or
                    presentation to bring it here.
                  </p>
                ) : (
                  data.recentThreads.map(thread => (
                    <Link
                      key={thread.id}
                      href={thread.href}
                      className="flex items-center gap-3 rounded-md border bg-background p-3 transition-colors hover:bg-muted/40"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted/40">
                        <MessageCircle className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {thread.title}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {thread.summary ?? thread.model ?? 'Untitled'}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatRelative(thread.updatedAt)}
                      </span>
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Members</CardTitle>
                <CardDescription>
                  {data.totals.members} member
                  {data.totals.members === 1 ? '' : 's'} · {ownerCount} owner
                  {ownerCount === 1 ? '' : 's'} · {editorCount} editor
                  {editorCount === 1 ? '' : 's'} · {viewerCount} viewer
                  {viewerCount === 1 ? '' : 's'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {data.members.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No members yet. Invite teammates to collaborate.
                  </p>
                ) : (
                  data.members.map(member => (
                    <div
                      key={member.id}
                      className="flex items-center gap-3 rounded-md border bg-background p-2.5"
                    >
                      <span className="flex size-8 items-center justify-center rounded-full bg-muted/40 text-xs font-semibold">
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
                <CardTitle className="text-sm">Invites</CardTitle>
                <CardDescription>
                  Pending email and link invites.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {data.invites.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No pending invites.
                  </p>
                ) : (
                  data.invites.map(invite => (
                    <div
                      key={invite.id}
                      className="flex items-center gap-3 rounded-md border bg-background p-2.5"
                    >
                      <span className="flex size-7 items-center justify-center rounded-full bg-muted/40">
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
                <Button disabled variant="outline" size="sm" className="w-full">
                  <UserPlus className="size-3.5" />
                  Invite member
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Sharing</CardTitle>
                <CardDescription>
                  Manage how this space is shared.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                <Button disabled variant="outline" size="sm" className="w-full">
                  <Share2 className="size-3.5" />
                  Share space
                </Button>
                <Button disabled variant="outline" size="sm" className="w-full">
                  <Shield className="size-3.5" />
                  Permissions
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Activity</CardTitle>
                <CardDescription>
                  Who&apos;s online and what they touched last.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {data.members
                  .filter(member => member.lastActiveAt)
                  .slice(0, 4)
                  .map(member => (
                    <div
                      key={member.id}
                      className="flex items-center gap-2 text-xs"
                    >
                      <Clock3 className="size-3 text-muted-foreground" />
                      <span className="truncate font-medium">
                        {member.displayName ?? member.email ?? member.userId}
                      </span>
                      <span className="ml-auto text-muted-foreground">
                        {formatRelative(member.lastActiveAt)}
                      </span>
                    </div>
                  ))}
                {data.members.filter(member => member.lastActiveAt).length ===
                0 ? (
                  <p className="text-xs text-muted-foreground">
                    No recent activity yet.
                  </p>
                ) : null}
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
  icon: typeof Search
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
      <p className="max-w-sm text-xs text-muted-foreground">
        Create a project to organize related threads, files, and notes.
      </p>
    </div>
  )
}
