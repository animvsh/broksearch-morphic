import Link from 'next/link'
import { redirect } from 'next/navigation'

import {
  ArrowRight,
  Clock3,
  Globe2,
  KeyRound,
  Link2,
  Lock,
  PanelLeft,
  Plus,
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

const ROLE_ICON: Record<SpaceRole, typeof Shield> = {
  owner: Shield,
  editor: UserPlus,
  viewer: Users
}

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

function visibilityIcon(visibility: SpaceSummary['visibility']) {
  if (visibility === 'public') return Globe2
  if (visibility === 'link') return Link2
  return Lock
}

const VISIBILITY_ICON_MAP = {
  public: Globe2,
  link: Link2,
  private: Lock
} as const

function visibilityLabel(visibility: SpaceSummary['visibility']) {
  if (visibility === 'public') return 'Public'
  if (visibility === 'link') return 'Link sharing'
  return 'Private'
}

export default async function SpacesPage() {
  const user = await requireFeatureAccess('/spaces', 'search')
  if (!user) {
    redirect(`/auth/login?redirectTo=${encodeURIComponent('/spaces')}`)
  }

  const spaces = await listSpaces()
  const owned = spaces.filter(space => space.role === 'owner')
  const memberOf = spaces.filter(space => space.role !== 'owner')

  return (
    <div className="dashboard-shell min-h-svh px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="overflow-hidden rounded-xl border bg-background shadow-sm">
          <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="min-w-0">
              <Badge variant="outline" className="mb-4 gap-2 bg-background">
                <PanelLeft className="size-3.5" />
                Spaces
              </Badge>
              <h1 className="text-3xl font-semibold tracking-normal sm:text-4xl">
                Shared research workspaces
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Spaces are collaborative folders for threads, projects, and
                presentations. Invite teammates via email or share a link, set
                permissions, and keep your research organized in one place.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button disabled className="gap-2">
                <Plus className="size-4" />
                New space
              </Button>
            </div>
          </div>
          <div className="grid border-t bg-muted/25 sm:grid-cols-3">
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
              label="Total members"
              value={spaces
                .reduce((sum, space) => sum + space.memberCount, 0)
                .toString()}
              icon={UserPlus}
            />
          </div>
        </header>

        <section className="space-y-6">
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Your spaces</h2>
              <span className="text-xs text-muted-foreground">
                Sorted by most recent activity
              </span>
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

          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">How spaces work</CardTitle>
                <CardDescription>
                  Each space can hold threads, projects, and presentations, with
                  member roles and presence.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 text-sm sm:grid-cols-3">
                <div>
                  <p className="font-medium">Members & roles</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Owners manage members and settings. Editors contribute
                    threads and projects. Viewers read and react.
                  </p>
                </div>
                <div>
                  <p className="font-medium">Space-level chat</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Each space has its own chat channel in addition to
                    per-project and per-thread discussions.
                  </p>
                </div>
                <div>
                  <p className="font-medium">Real-time presence</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    See who is active in the space right now and jump into their
                    current thread.
                  </p>
                </div>
              </CardContent>
            </Card>
            <aside className="space-y-3">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Invite by link</CardTitle>
                  <CardDescription>
                    Generate a one-time invite link with a chosen role.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button disabled variant="outline" className="w-full gap-2">
                    <Link2 className="size-4" />
                    Create invite link
                  </Button>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Public spaces</CardTitle>
                  <CardDescription>
                    Toggle visibility to public for read-only access via
                    shareable URL.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button disabled variant="outline" className="w-full gap-2">
                    <Globe2 className="size-4" />
                    View public spaces
                  </Button>
                </CardContent>
              </Card>
            </aside>
          </div>
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

function SpaceCard({ space }: { space: SpaceSummary }) {
  const VisibilityIcon = VISIBILITY_ICON_MAP[space.visibility]
  const RoleIcon = ROLE_ICON[space.role]
  return (
    <Card className="group flex h-full flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className="flex size-9 items-center justify-center rounded-md text-sm font-semibold text-white"
              style={{
                backgroundColor: space.iconColor ?? '#1f2937'
              }}
            >
              {space.name.charAt(0).toUpperCase()}
            </span>
            <div>
              <CardTitle className="text-base">
                <Link href={`/spaces/${space.id}`} className="hover:underline">
                  {space.name}
                </Link>
              </CardTitle>
              <CardDescription className="text-[11px] uppercase tracking-wide">
                /{space.slug}
              </CardDescription>
            </div>
          </div>
          <Badge variant="outline" className="gap-1 text-[10px]">
            <VisibilityIcon className="size-3" />
            {visibilityLabel(space.visibility)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-3">
        <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">
          {space.description ?? 'No description yet.'}
        </p>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Members" value={space.memberCount} />
          <Stat label="Threads" value={space.threadCount} />
          <Stat label="Projects" value={space.projectCount} />
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <RoleIcon className="size-3" />
            {ROLE_LABELS[space.role]}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock3 className="size-3" />
            {formatRelative(space.lastActivityAt)}
          </span>
        </div>
        <Button asChild variant="outline" size="sm" className="w-full">
          <Link href={`/spaces/${space.id}`}>
            Open space
            <ArrowRight className="ml-1 size-3.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-muted/30 px-2 py-1.5">
      <p className="text-sm font-semibold leading-none">{value}</p>
      <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
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
        <h2 className="text-lg font-semibold">Create your first space</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Spaces group related threads, projects, and presentations so you can
          collaborate with teammates or keep research organized.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button disabled>
            <Plus className="mr-2 size-4" />
            New space
          </Button>
          <Button asChild variant="outline">
            <Link href="/">
              <KeyRound className="mr-2 size-4" />
              Browse search
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
