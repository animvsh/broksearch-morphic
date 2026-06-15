import Link from 'next/link'
import { redirect } from 'next/navigation'

import {
  ArrowRight,
  BookOpen,
  Clock3,
  FileText,
  Globe2,
  KeyRound,
  Link2,
  Lock,
  type LucideIcon,
  PanelLeft,
  Search,
  Shield,
  UserPlus,
  Users
} from 'lucide-react'

import {
  listSpaces,
  type SpaceRole,
  type SpaceSummary
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

const ROLE_ICON: Record<SpaceRole, LucideIcon> = {
  owner: Shield,
  editor: UserPlus,
  viewer: Users
}

const VISIBILITY_ICON_MAP = {
  public: Globe2,
  link: Link2,
  private: Lock
} as const

function formatRelative(value: Date) {
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

function visibilityLabel(visibility: SpaceSummary['visibility']) {
  if (visibility === 'public') return 'Public'
  if (visibility === 'link') return 'Link sharing'
  return 'Private'
}

function plural(value: number, singular: string, pluralLabel = `${singular}s`) {
  return `${value} ${value === 1 ? singular : pluralLabel}`
}

export default async function SpacesPage() {
  const user = await requireFeatureAccess('/spaces', 'search')
  if (!user) {
    redirect(`/auth/login?redirectTo=${encodeURIComponent('/spaces')}`)
  }

  const spaces = await listSpaces()
  const owned = spaces.filter(space => space.role === 'owner')
  const memberOf = spaces.filter(space => space.role !== 'owner')
  const totalThreads = spaces.reduce((sum, space) => sum + space.threadCount, 0)
  const totalProjects = spaces.reduce(
    (sum, space) => sum + space.projectCount,
    0
  )
  const activeSpaces = spaces.filter(
    space =>
      space.threadCount + space.projectCount + space.presentationCount > 0
  )

  return (
    <div className="dashboard-shell min-h-svh px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="overflow-hidden rounded-xl border bg-background shadow-sm">
          <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="min-w-0">
              <Badge variant="outline" className="mb-4 gap-2 bg-background">
                <PanelLeft className="size-3.5" />
                Spaces
              </Badge>
              <h1 className="text-3xl font-semibold tracking-normal sm:text-4xl">
                Team research spaces
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Keep related searches, projects, and presentations together with
                visible roles, ownership, and recent activity.
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
                  Start search
                </Link>
              </Button>
            </div>
          </div>
          <div className="grid border-t bg-muted/25 sm:grid-cols-4">
            <Metric
              label="Spaces owned"
              value={owned.length.toString()}
              icon={Shield}
            />
            <Metric
              label="Member of"
              value={memberOf.length.toString()}
              icon={Users}
            />
            <Metric
              label="Threads"
              value={totalThreads.toString()}
              icon={FileText}
            />
            <Metric
              label="Projects"
              value={totalProjects.toString()}
              icon={PanelLeft}
            />
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0 space-y-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Your spaces</h2>
                <p className="text-sm text-muted-foreground">
                  Sorted by most recent activity from the space records.
                </p>
              </div>
              {spaces.length > 0 ? (
                <Badge variant="secondary" className="w-fit">
                  {plural(activeSpaces.length, 'active space')}
                </Badge>
              ) : null}
            </div>
            {spaces.length === 0 ? (
              <EmptySpaces />
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {spaces.map(space => (
                  <SpaceCard key={space.id} space={space} />
                ))}
              </div>
            )}
          </div>

          <aside className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Workspace context</CardTitle>
                <CardDescription>
                  Spaces are shown from membership and ownership records. Invite
                  counts and sharing state appear only where that data exists.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2 pt-0 text-xs text-muted-foreground">
                <ContextLine
                  icon={Shield}
                  label="Access"
                  value={`${owned.length} owned, ${memberOf.length} joined`}
                />
                <ContextLine
                  icon={Users}
                  label="Members"
                  value={plural(
                    spaces.reduce((sum, space) => sum + space.memberCount, 0),
                    'record'
                  )}
                />
                <ContextLine
                  icon={Clock3}
                  label="Activity"
                  value={
                    spaces[0]
                      ? `Latest ${formatRelative(spaces[0].lastActivityAt)}`
                      : 'No activity yet'
                  }
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">What belongs here</CardTitle>
                <CardDescription>
                  Use spaces as lightweight project memory for searches,
                  source-backed threads, and Brok work artifacts.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <GuidanceItem
                  icon={Search}
                  title="Start from a question"
                  description="Run a search, then save or assign the useful work when the data model supports it."
                />
                <GuidanceItem
                  icon={BookOpen}
                  title="Reopen saved work"
                  description="Library is the source for threads and presentations already attached to a space."
                />
                <GuidanceItem
                  icon={Users}
                  title="Review access"
                  description="Roles, visibility, and pending invites are displayed from existing records."
                />
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

function SpaceCard({ space }: { space: SpaceSummary }) {
  const VisibilityIcon = VISIBILITY_ICON_MAP[space.visibility]
  const RoleIcon = ROLE_ICON[space.role]
  const workCount =
    space.threadCount + space.projectCount + space.presentationCount

  return (
    <Card className="group relative flex h-full flex-col overflow-hidden transition-colors hover:border-foreground/20 hover:bg-muted/20">
      <Link
        href={`/spaces/${space.id}`}
        className="absolute inset-0 z-10"
        aria-label={`Open ${space.name}`}
      />
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-md text-sm font-semibold text-white"
              style={{
                backgroundColor: space.iconColor ?? '#1f2937'
              }}
            >
              {space.name.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <CardTitle className="truncate text-base">{space.name}</CardTitle>
              <CardDescription className="truncate text-[11px] uppercase tracking-wide">
                /{space.slug}
              </CardDescription>
            </div>
          </div>
          <Badge variant="outline" className="shrink-0 gap-1 text-[10px]">
            <VisibilityIcon className="size-3" />
            {visibilityLabel(space.visibility)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-4">
        <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">
          {space.description ??
            'No description yet. Add context through saved threads, projects, and presentations.'}
        </p>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Members" value={space.memberCount} />
          <Stat label="Threads" value={space.threadCount} />
          <Stat label="Projects" value={space.projectCount} />
        </div>
        <div className="rounded-md border bg-background/70 p-3">
          <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span className="inline-flex min-w-0 items-center gap-1">
              <RoleIcon className="size-3 shrink-0" />
              <span className="truncate">{ROLE_LABELS[space.role]}</span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1">
              <Clock3 className="size-3" />
              {formatRelative(space.lastActivityAt)}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">
              {workCount > 0
                ? plural(workCount, 'saved item')
                : 'Ready for saved work'}
            </span>
            <span className="inline-flex items-center font-medium text-foreground">
              Open
              <ArrowRight className="ml-1 size-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-muted/30 px-2 py-2">
      <p className="text-sm font-semibold leading-none">{value}</p>
      <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
    </div>
  )
}

function ContextLine({
  icon: Icon,
  label,
  value
}: {
  icon: LucideIcon
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-background p-2.5">
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="font-medium text-foreground">{label}</span>
      <span className="ml-auto text-right">{value}</span>
    </div>
  )
}

function GuidanceItem({
  icon: Icon,
  title,
  description
}: {
  icon: LucideIcon
  title: string
  description: string
}) {
  return (
    <div className="flex gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted/30">
        <Icon className="size-4 text-muted-foreground" />
      </span>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  )
}

function EmptySpaces() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <span className="flex size-12 items-center justify-center rounded-full border bg-muted/40">
          <PanelLeft className="size-5" />
        </span>
        <h2 className="text-lg font-semibold">No spaces yet</h2>
        <p className="max-w-md text-sm leading-6 text-muted-foreground">
          Spaces become useful once searches, projects, or presentations are
          attached. Start with a source-grounded search or review saved work in
          Library.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild>
            <Link href="/search">
              <Search className="mr-2 size-4" />
              Start search
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/library">
              <KeyRound className="mr-2 size-4" />
              Open library
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
