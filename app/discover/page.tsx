import Link from 'next/link'
import { redirect } from 'next/navigation'

import {
  ArrowUpRight,
  Bookmark,
  Clock3,
  Code2,
  Compass,
  Flame,
  MessageSquare,
  Presentation,
  Search,
  Share2,
  Sparkles,
  TerminalSquare,
  ThumbsUp,
  TrendingUp
} from 'lucide-react'

import {
  type DiscoverCategory,
  type DiscoverItemKind,
  type DiscoverPublicItem,
  getDiscoverCategoryLabel,
  getDiscoverCategoryOrder,
  getDiscoverFeedData
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

const CATEGORY_DESCRIPTIONS: Record<DiscoverCategory, string> = {
  ai_apps: 'Community-built AI apps and demos',
  search: 'Trending research threads and deep dives',
  code: 'Popular code snippets, repos, and BrokCode apps',
  chat: 'Conversation starters and useful prompts',
  presentations: 'Beautiful decks worth a second look'
}

const KIND_ICON: Record<DiscoverItemKind, typeof Sparkles> = {
  thread: MessageSquare,
  project: Code2,
  presentation: Presentation,
  prompt: Sparkles,
  api_session: TerminalSquare
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

function formatCount(value: number) {
  if (value < 1000) return value.toString()
  if (value < 10000) return `${(value / 1000).toFixed(1)}k`
  if (value < 1_000_000) return `${Math.round(value / 1000)}k`
  return `${(value / 1_000_000).toFixed(1)}M`
}

export default async function DiscoverPage({
  searchParams
}: {
  searchParams: Promise<{ category?: string | string[] }>
}) {
  const user = await requireFeatureAccess('/discover', 'search')
  if (!user) {
    redirect(`/auth/login?redirectTo=${encodeURIComponent('/discover')}`)
  }

  const params = (await searchParams) ?? {}
  const requestedCategory = Array.isArray(params.category)
    ? params.category[0]
    : params.category
  const activeCategory: DiscoverCategory | 'all' =
    requestedCategory && isDiscoverCategory(requestedCategory)
      ? requestedCategory
      : 'all'

  const data = await getDiscoverFeedData()
  const categoryOrder = getDiscoverCategoryOrder()
  const categories = categoryOrder.map(category => ({
    id: category,
    label: getDiscoverCategoryLabel(category),
    description: CATEGORY_DESCRIPTIONS[category],
    items: data.byCategory[category]?.items ?? []
  }))

  return (
    <div className="dashboard-shell min-h-svh px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="overflow-hidden rounded-xl border bg-background shadow-sm">
          <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="min-w-0">
              <Badge variant="outline" className="mb-4 gap-2 bg-background">
                <Compass className="size-3.5" />
                Discover
              </Badge>
              <h1 className="text-3xl font-semibold tracking-normal sm:text-4xl">
                What the Brok community is researching
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Trending searches, popular public projects, featured
                presentations, and reusable prompts from across the Brok
                network.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" className="gap-2">
                <Link href="/library">
                  <Sparkles className="size-4" />
                  My library
                </Link>
              </Button>
              <Button asChild className="gap-2">
                <Link href="/">
                  <Search className="size-4" />
                  Start a search
                </Link>
              </Button>
            </div>
          </div>
          <div className="grid border-t bg-muted/25 sm:grid-cols-3">
            <Metric
              label="Public items"
              value={formatCount(data.totals.items)}
              icon={Compass}
            />
            <Metric
              label="Total likes"
              value={formatCount(data.totals.likes)}
              icon={ThumbsUp}
            />
            <Metric
              label="Saves"
              value={formatCount(data.totals.saves)}
              icon={Bookmark}
            />
          </div>
        </header>

        <nav className="flex flex-wrap items-center gap-2 rounded-xl border bg-background p-3 shadow-sm">
          <CategoryChip
            label="All"
            active={activeCategory === 'all'}
            href="/discover"
            icon={Flame}
          />
          {categories.map(category => (
            <CategoryChip
              key={category.id}
              label={category.label}
              active={activeCategory === category.id}
              href={`/discover?category=${category.id}`}
              icon={TrendingUp}
            />
          ))}
        </nav>

        {data.featured.length > 0 ? (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Featured</h2>
              <span className="text-xs text-muted-foreground">
                Hand-picked by Brok editors
              </span>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {data.featured.map(item => (
                <FeaturedCard key={item.id} item={item} />
              ))}
            </div>
          </section>
        ) : null}

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Trending now</h2>
            <span className="text-xs text-muted-foreground">
              Top searches in the last 24h
            </span>
          </div>
          {data.trending.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                No trending topics yet. As the community searches, topics will
                appear here.
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-wrap gap-2">
              {data.trending.map(topic => (
                <Link
                  key={topic.id}
                  href={`/?q=${encodeURIComponent(topic.label)}`}
                  className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-xs font-medium transition-colors hover:border-primary/40 hover:bg-primary/5"
                >
                  <Flame className="size-3 text-orange-500" />
                  {topic.label}
                  <span className="text-[10px] text-muted-foreground">
                    {topic.velocity}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4">
          {categories.map(category => {
            const items = activeCategory === 'all'
              ? category.items
              : activeCategory === category.id
                ? category.items
                : []
            if (activeCategory !== 'all' && activeCategory !== category.id) {
              return null
            }
            return (
              <div key={category.id} className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold">
                      {category.label}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {category.description}
                    </p>
                  </div>
                  <Button asChild variant="ghost" size="sm" className="gap-1">
                    <Link href={`/discover?category=${category.id}`}>
                      See all
                      <ArrowUpRight className="size-3" />
                    </Link>
                  </Button>
                </div>
                {items.length === 0 ? (
                  <Card>
                    <CardContent className="py-6 text-center text-sm text-muted-foreground">
                      No items in this category yet.
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {items.map(item => (
                      <DiscoverCard key={item.id} item={item} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </section>
      </div>
    </div>
  )
}

function isDiscoverCategory(value: string): value is DiscoverCategory {
  return (
    value === 'ai_apps' ||
    value === 'search' ||
    value === 'code' ||
    value === 'chat' ||
    value === 'presentations'
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

function CategoryChip({
  label,
  active,
  href,
  icon: Icon
}: {
  label: string
  active: boolean
  href: string
  icon: typeof Flame
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? 'border-primary/40 bg-primary/10 text-foreground'
          : 'border-border/60 bg-background text-muted-foreground hover:border-border/80'
      }`}
    >
      <Icon className="size-3" />
      {label}
    </Link>
  )
}

function FeaturedCard({ item }: { item: DiscoverPublicItem }) {
  const Icon = KIND_ICON[item.kind]
  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <Badge variant="secondary" className="gap-1 text-[10px]">
            <Icon className="size-3" />
            {item.kind.replace('_', ' ')}
          </Badge>
          <Badge variant="outline" className="gap-1 text-[10px]">
            <Sparkles className="size-3" />
            Featured
          </Badge>
        </div>
        <CardTitle className="mt-2 line-clamp-2 text-base">
          <Link href={item.href} className="hover:underline">
            {item.title}
          </Link>
        </CardTitle>
        {item.authorName ? (
          <CardDescription>
            by {item.authorName}
            {item.authorHandle ? ` · @${item.authorHandle}` : ''}
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-3 pt-0">
        {item.summary ? (
          <p className="line-clamp-3 text-sm text-muted-foreground">
            {item.summary}
          </p>
        ) : null}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <ThumbsUp className="size-3" />
            {formatCount(item.likeCount)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Bookmark className="size-3" />
            {formatCount(item.saveCount)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock3 className="size-3" />
            {formatRelative(item.publishedAt)}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

function DiscoverCard({ item }: { item: DiscoverPublicItem }) {
  const Icon = KIND_ICON[item.kind]
  return (
    <Card className="group flex h-full flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <Badge variant="secondary" className="gap-1 text-[10px]">
            <Icon className="size-3" />
            {item.kind.replace('_', ' ')}
          </Badge>
          <span className="text-[11px] text-muted-foreground">
            {formatRelative(item.publishedAt)}
          </span>
        </div>
        <CardTitle className="mt-2 line-clamp-2 text-sm">
          <Link href={item.href} className="hover:underline">
            {item.title}
          </Link>
        </CardTitle>
        {item.authorName ? (
          <CardDescription className="text-xs">
            by {item.authorName}
            {item.authorHandle ? ` · @${item.authorHandle}` : ''}
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-3 pt-0">
        {item.summary ? (
          <p className="line-clamp-3 text-xs text-muted-foreground">
            {item.summary}
          </p>
        ) : (
          <p className="text-xs italic text-muted-foreground">
            No summary yet.
          </p>
        )}
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <ThumbsUp className="size-3" />
            {formatCount(item.likeCount)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Share2 className="size-3" />
            {formatCount(item.shareCount)}
          </span>
          <Button variant="ghost" size="icon" className="size-7">
            <Bookmark className="size-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
