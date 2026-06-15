import Link from 'next/link'
import { redirect } from 'next/navigation'

import {
  Archive,
  ArrowDownUp,
  BookOpen,
  CalendarRange,
  CheckSquare,
  ChevronRight,
  Code2,
  ExternalLink,
  Filter,
  Folder,
  Globe2,
  LayoutGrid,
  List as ListIcon,
  MessageSquare,
  Presentation,
  Search,
  Share2,
  Sparkles,
  Tag as TagIcon,
  TerminalSquare,
  TextSearch
} from 'lucide-react'

import {
  getLibraryData,
  getLibraryKindLabel,
  getLibraryKindOrder,
  getLibrarySortLabel,
  type LibraryFiltersInput,
  type LibraryItem,
  type LibraryItemKind,
  type LibrarySort
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

const KIND_ICON: Record<LibraryItemKind, typeof BookOpen> = {
  search: Search,
  chat: MessageSquare,
  project: Code2,
  presentation: Presentation,
  api_session: TerminalSquare
}

const SORT_OPTIONS: LibrarySort[] = ['recent', 'most_used', 'most_cited']

const STATUS_OPTIONS = [
  { value: 'active', label: 'Saved' },
  { value: 'public', label: 'Public' },
  { value: 'all', label: 'All' }
] as const

function isLibraryItemKind(value: string): value is LibraryItemKind {
  return (
    value === 'search' ||
    value === 'chat' ||
    value === 'project' ||
    value === 'presentation' ||
    value === 'api_session'
  )
}

function isLibrarySort(value: string): value is LibrarySort {
  return value === 'recent' || value === 'most_used' || value === 'most_cited'
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date(value))
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
  if (days < 30) return `${days}d ago`
  return formatDate(value)
}

type LibrarySearchParams = {
  q?: string
  kind?: string | string[]
  sort?: string
  tag?: string | string[]
  from?: string
  to?: string
  view?: string
  status?: string
}

function readParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

function readListParam(value: string | string[] | undefined): string[] {
  if (!value) return []
  if (Array.isArray(value)) return value.flatMap(v => v.split(','))
  return value
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
}

export default async function LibraryPage({
  searchParams
}: {
  searchParams: Promise<LibrarySearchParams>
}) {
  const user = await requireFeatureAccess('/library', 'search')
  if (!user) {
    redirect(`/auth/login?redirectTo=${encodeURIComponent('/library')}`)
  }

  const params = (await searchParams) ?? {}
  const query = readParam(params.q)?.trim() ?? ''
  const sortRaw = readParam(params.sort) ?? 'recent'
  const sort: LibrarySort = isLibrarySort(sortRaw) ? sortRaw : 'recent'
  const kinds = readListParam(params.kind).filter(isLibraryItemKind)
  const tags = readListParam(params.tag)
  const dateFrom = readParam(params.from)
  const dateTo = readParam(params.to)
  const view = readParam(params.view) === 'list' ? 'list' : 'grid'
  const statusFilter = readParam(params.status) ?? 'active'

  const filters: LibraryFiltersInput = {
    query: query || undefined,
    kinds: kinds.length > 0 ? kinds : undefined,
    tagNames: tags.length > 0 ? tags : undefined,
    sort,
    dateFrom,
    dateTo,
    statuses:
      statusFilter === 'all' || statusFilter === 'public'
        ? undefined
        : ['active', 'shared']
  }

  const data = await getLibraryData(filters)
  const visibleItems =
    statusFilter === 'public'
      ? data.items.filter(item => item.isPublic)
      : data.items
  const kindOrder = getLibraryKindOrder()
  const kindActive = new Set(kinds)

  return (
    <div className="dashboard-shell min-h-svh px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="overflow-hidden border-b bg-background">
          <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="min-w-0">
              <Badge variant="outline" className="mb-4 gap-2 bg-background">
                <BookOpen className="size-3.5" />
                Library
              </Badge>
              <h1 className="text-3xl font-semibold tracking-normal sm:text-4xl">
                Saved intelligence, ready to reuse
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Keep your source-grounded answers, research threads, app work,
                and generated artifacts in one calm, searchable place.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" className="gap-2">
                <Link href="/discover">
                  <Sparkles className="size-4" />
                  Discover public feed
                </Link>
              </Button>
              <Button asChild className="gap-2">
                <Link href="/search">
                  <Search className="size-4" />
                  New search
                </Link>
              </Button>
            </div>
          </div>
          <div className="grid border-t bg-muted/25 sm:grid-cols-4">
            <Metric label="Items" value={data.totals.items.toString()} />
            <Metric
              label="Shared"
              value={data.totals.public.toString()}
              icon={Globe2}
            />
            <Metric
              label="Archived"
              value={data.totals.archived.toString()}
              icon={Archive}
            />
            <Metric
              label="Tags"
              value={data.tags.length.toString()}
              icon={TagIcon}
            />
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[260px_1fr]">
          <aside className="space-y-4">
            <FilterCard title="Saved view" icon={TextSearch}>
              <div className="grid grid-cols-3 rounded-md border bg-muted/30 p-0.5 text-xs">
                {STATUS_OPTIONS.map(option => (
                  <Link
                    key={option.value}
                    href={buildLibraryHref({
                      query,
                      kinds,
                      tags,
                      sort,
                      from: dateFrom,
                      to: dateTo,
                      view,
                      status: option.value
                    })}
                    className={`rounded px-2 py-1.5 text-center font-medium transition-colors ${
                      statusFilter === option.value
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {option.label}
                  </Link>
                ))}
              </div>
            </FilterCard>

            <FilterCard title="Type" icon={Filter}>
              <div className="flex flex-col gap-1.5">
                {kindOrder.map(kind => {
                  const count = data.totals.byKind[kind] ?? 0
                  const Icon = KIND_ICON[kind]
                  const active = kindActive.has(kind)
                  const remaining = new Set(kinds)
                  if (active) remaining.delete(kind)
                  else remaining.add(kind)
                  return (
                    <Link
                      key={kind}
                      href={buildLibraryHref({
                        query,
                        kinds: Array.from(remaining),
                        tags,
                        sort,
                        from: dateFrom,
                        to: dateTo,
                        view,
                        status: statusFilter
                      })}
                      className={`flex items-center justify-between rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                        active
                          ? 'border-primary/40 bg-primary/10 text-foreground'
                          : 'border-transparent text-muted-foreground hover:border-border/70 hover:bg-muted/50'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <Icon className="size-3.5" />
                        {getLibraryKindLabel(kind)}
                      </span>
                      <span className="text-[11px] font-medium">{count}</span>
                    </Link>
                  )
                })}
              </div>
            </FilterCard>

            <FilterCard title="Tags" icon={TagIcon}>
              {data.tags.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No tags yet. Tag items from the item menu to organize your
                  library.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {data.tags.map(tag => {
                    const active = tags.includes(tag.name)
                    const remaining = new Set(tags)
                    if (active) remaining.delete(tag.name)
                    else remaining.add(tag.name)
                    return (
                      <Link
                        key={tag.id}
                        href={buildLibraryHref({
                          query,
                          kinds,
                          tags: Array.from(remaining),
                          sort,
                          from: dateFrom,
                          to: dateTo,
                          view,
                          status: statusFilter
                        })}
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                          active
                            ? 'border-primary/40 bg-primary/10 text-foreground'
                            : 'border-border/60 bg-background text-muted-foreground hover:border-border/80'
                        }`}
                      >
                        <TagIcon className="size-3" />
                        {tag.name}
                        <span className="text-[10px] opacity-70">
                          {tag.count}
                        </span>
                      </Link>
                    )
                  })}
                </div>
              )}
            </FilterCard>

            <FilterCard title="Date range" icon={CalendarRange}>
              <form action="/library" className="flex flex-col gap-2">
                <input type="hidden" name="q" value={query} />
                <input type="hidden" name="sort" value={sort} />
                {kinds.map(k => (
                  <input key={k} type="hidden" name="kind" value={k} />
                ))}
                {tags.map(t => (
                  <input key={t} type="hidden" name="tag" value={t} />
                ))}
                {statusFilter !== 'active' ? (
                  <input type="hidden" name="status" value={statusFilter} />
                ) : null}
                <input
                  type="hidden"
                  name="view"
                  value={view === 'list' ? 'list' : 'grid'}
                />
                <input
                  type="date"
                  name="from"
                  defaultValue={dateFrom ?? ''}
                  className="h-9 rounded-md border bg-background px-2 text-xs"
                />
                <input
                  type="date"
                  name="to"
                  defaultValue={dateTo ?? ''}
                  className="h-9 rounded-md border bg-background px-2 text-xs"
                />
                <div className="flex gap-1.5">
                  <Button type="submit" size="sm" className="flex-1">
                    Apply
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link href="/library">Reset</Link>
                  </Button>
                </div>
              </form>
            </FilterCard>
          </aside>

          <div className="space-y-4">
            <div className="flex flex-col gap-3 rounded-xl border bg-background p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <form
                action="/library"
                className="flex w-full flex-1 items-center gap-2 sm:max-w-md"
              >
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="search"
                    name="q"
                    defaultValue={query}
                    placeholder="Search saved answers, sources, models..."
                    className="h-9 w-full rounded-md border bg-background pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                {kinds.map(k => (
                  <input key={k} type="hidden" name="kind" value={k} />
                ))}
                {tags.map(t => (
                  <input key={t} type="hidden" name="tag" value={t} />
                ))}
                {dateFrom && (
                  <input type="hidden" name="from" value={dateFrom} />
                )}
                {dateTo && <input type="hidden" name="to" value={dateTo} />}
                {statusFilter !== 'active' ? (
                  <input type="hidden" name="status" value={statusFilter} />
                ) : null}
                <input
                  type="hidden"
                  name="view"
                  value={view === 'list' ? 'list' : 'grid'}
                />
                <input type="hidden" name="sort" value={sort} />
                <Button type="submit" variant="outline" size="sm">
                  Search
                </Button>
              </form>

              <div className="flex flex-wrap items-center gap-2">
                <form action="/library" className="flex items-center gap-1">
                  {query && <input type="hidden" name="q" value={query} />}
                  {kinds.map(k => (
                    <input key={k} type="hidden" name="kind" value={k} />
                  ))}
                  {tags.map(t => (
                    <input key={t} type="hidden" name="tag" value={t} />
                  ))}
                  {dateFrom && (
                    <input type="hidden" name="from" value={dateFrom} />
                  )}
                  {dateTo && <input type="hidden" name="to" value={dateTo} />}
                  {statusFilter !== 'active' ? (
                    <input type="hidden" name="status" value={statusFilter} />
                  ) : null}
                  <input
                    type="hidden"
                    name="view"
                    value={view === 'list' ? 'list' : 'grid'}
                  />
                  <ArrowDownUp className="size-3.5 text-muted-foreground" />
                  <select
                    name="sort"
                    defaultValue={sort}
                    className="h-8 rounded-md border bg-background px-2 text-xs"
                  >
                    {SORT_OPTIONS.map(option => (
                      <option key={option} value={option}>
                        {getLibrarySortLabel(option)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="sr-only"
                    aria-label="Apply sort"
                  />
                </form>

                <div className="inline-flex items-center rounded-md border bg-background p-0.5 text-xs">
                  <Link
                    href={buildViewHref(
                      'grid',
                      query,
                      kinds,
                      tags,
                      sort,
                      dateFrom,
                      dateTo,
                      statusFilter
                    )}
                    className={`inline-flex items-center gap-1 rounded-sm px-2 py-1 ${
                      view === 'grid'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground'
                    }`}
                  >
                    <LayoutGrid className="size-3.5" />
                    Grid
                  </Link>
                  <Link
                    href={buildViewHref(
                      'list',
                      query,
                      kinds,
                      tags,
                      sort,
                      dateFrom,
                      dateTo,
                      statusFilter
                    )}
                    className={`inline-flex items-center gap-1 rounded-sm px-2 py-1 ${
                      view === 'list'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground'
                    }`}
                  >
                    <ListIcon className="size-3.5" />
                    List
                  </Link>
                </div>
              </div>
            </div>

            {visibleItems.length === 0 ? (
              <EmptyLibrary
                query={query}
                hasFilters={
                  kinds.length > 0 ||
                  tags.length > 0 ||
                  Boolean(dateFrom) ||
                  Boolean(dateTo) ||
                  statusFilter !== 'active'
                }
              />
            ) : view === 'grid' ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {visibleItems.map(item => (
                  <LibraryGridCard key={item.id} item={item} />
                ))}
              </div>
            ) : (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <div>
                    <CardTitle className="text-base">
                      {visibleItems.length} item
                      {visibleItems.length === 1 ? '' : 's'}
                    </CardTitle>
                    <CardDescription>
                      {getLibrarySortLabel(sort)}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <CheckSquare className="size-3.5" />
                    Bulk actions coming soon
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 px-3 pb-3">
                  {visibleItems.map(item => (
                    <LibraryListRow key={item.id} item={item} />
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function buildViewHref(
  view: 'grid' | 'list',
  query: string,
  kinds: LibraryItemKind[],
  tags: string[],
  sort: LibrarySort,
  from: string | undefined,
  to: string | undefined,
  status: string
) {
  return buildLibraryHref({ query, kinds, tags, sort, from, to, view, status })
}

function buildLibraryHref({
  query,
  kinds,
  tags,
  sort,
  from,
  to,
  view,
  status
}: {
  query: string
  kinds: LibraryItemKind[]
  tags: string[]
  sort: LibrarySort
  from: string | undefined
  to: string | undefined
  view: 'grid' | 'list'
  status: string
}) {
  const next = new URLSearchParams()
  if (query) next.set('q', query)
  if (view === 'list') next.set('view', view)
  if (sort !== 'recent') next.set('sort', sort)
  if (from) next.set('from', from)
  if (to) next.set('to', to)
  if (status !== 'active') next.set('status', status)
  for (const k of kinds) next.append('kind', k)
  for (const t of tags) next.append('tag', t)
  const queryString = next.toString()
  return queryString ? `/library?${queryString}` : '/library'
}

function Metric({
  icon: Icon,
  label,
  value
}: {
  icon?: typeof Search
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-3 border-b p-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-background shadow-sm ring-1 ring-border">
        {Icon ? (
          <Icon className="size-4 text-muted-foreground" />
        ) : (
          <Folder className="size-4 text-muted-foreground" />
        )}
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

function FilterCard({
  title,
  icon: Icon,
  children
}: {
  title: string
  icon: typeof Search
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-3">
        <Icon className="size-4 text-muted-foreground" />
        <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  )
}

function LibraryGridCard({ item }: { item: LibraryItem }) {
  const Icon = KIND_ICON[item.kind]
  const sourceLabel =
    item.kind === 'search'
      ? item.citeCount > 0
        ? `${item.citeCount} source${item.citeCount === 1 ? '' : 's'} cited`
        : 'Saved thread'
      : getLibraryKindLabel(item.kind)

  return (
    <Card className="flex h-full flex-col rounded-lg transition-colors hover:border-foreground/20">
      <CardHeader className="flex flex-row items-start gap-3 space-y-0 pb-2">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/40">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <CardTitle className="truncate text-sm font-semibold">
            <Link href={item.href} className="hover:underline">
              {item.title}
            </Link>
          </CardTitle>
          <CardDescription className="mt-0.5 text-[11px] uppercase tracking-wide">
            {sourceLabel}
            {item.model ? ` · ${item.model}` : ''}
          </CardDescription>
        </div>
        {item.isPublic ? (
          <Badge variant="secondary" className="gap-1 text-[10px]">
            <Globe2 className="size-3" />
            Public
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-3 pt-0">
        {item.summary ? (
          <p className="line-clamp-3 text-xs leading-5 text-muted-foreground">
            {item.summary}
          </p>
        ) : (
          <p className="text-xs italic text-muted-foreground">
            Open this saved thread to continue from the original context.
          </p>
        )}
        <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
          <span className="rounded-md border bg-muted/25 px-2 py-1">
            Used {item.useCount}
          </span>
          <span className="rounded-md border bg-muted/25 px-2 py-1">
            Updated {formatRelative(item.updatedAt)}
          </span>
        </div>
        {item.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {item.tags.slice(0, 3).map(tag => (
              <Badge
                key={tag}
                variant="outline"
                className="text-[10px] font-normal"
              >
                {tag}
              </Badge>
            ))}
          </div>
        ) : null}
        <div className="flex items-center justify-between border-t pt-3">
          <Button asChild variant="ghost" size="sm" className="gap-1.5 px-2">
            <Link href={item.href}>
              Open
              <ChevronRight className="size-3.5" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href={`/search?q=${encodeURIComponent(item.title)}`}>
              Ask follow-up
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function LibraryListRow({ item }: { item: LibraryItem }) {
  const Icon = KIND_ICON[item.kind]
  return (
    <div className="group flex items-center gap-3 rounded-lg border bg-background p-3 transition-colors hover:bg-muted/40">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/40">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold group-hover:underline">
          <Link href={item.href}>{item.title}</Link>
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {getLibraryKindLabel(item.kind)}
          {item.model ? ` · ${item.model}` : ''}
          {item.summary ? ` — ${item.summary}` : ''}
        </p>
      </div>
      <div className="hidden items-center gap-3 text-[11px] text-muted-foreground sm:flex">
        <span className="flex items-center gap-1">
          <Share2 className="size-3" />
          {item.isPublic ? 'Shared' : 'Private'}
        </span>
        <span>{item.citeCount} sources</span>
        <span>{formatRelative(item.updatedAt)}</span>
      </div>
      <Button asChild variant="ghost" size="icon" aria-label="Open item">
        <Link href={item.href}>
          <ExternalLink className="size-4" />
        </Link>
      </Button>
      <Button asChild variant="ghost" size="icon" aria-label="Ask follow-up">
        <Link href={`/search?q=${encodeURIComponent(item.title)}`}>
          <Search className="size-4" />
        </Link>
      </Button>
    </div>
  )
}

function EmptyLibrary({
  query,
  hasFilters
}: {
  query: string
  hasFilters: boolean
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <span className="flex size-12 items-center justify-center rounded-full border bg-muted/40">
          <BookOpen className="size-5" />
        </span>
        <h2 className="text-lg font-semibold">
          {query || hasFilters
            ? `No saved items match${query ? ` "${query}"` : ' these filters'}`
            : 'Your library is empty'}
        </h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          {query || hasFilters
            ? 'Try clearing the filters or starting a new search from the question you want to answer next.'
            : 'Saved search threads and generated work will appear here once you save them from Brok.'}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {query || hasFilters ? (
            <Button asChild variant="outline">
              <Link href="/library">Clear filters</Link>
            </Button>
          ) : null}
          <Button asChild>
            <Link href="/search">
              <Search className="mr-2 size-4" />
              Start a new search
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
