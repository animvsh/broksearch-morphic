import type { ReactNode } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import {
  ArrowUpRight,
  Bookmark,
  Clock3,
  Code2,
  Compass,
  FileText,
  Flame,
  Globe2,
  MessageSquare,
  Presentation,
  Search,
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
  getDiscoverFeedData,
  type TrendingTopic
} from '@/lib/actions/platform-dashboard'
import { requireFeatureAccess } from '@/lib/auth/app-access'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export const dynamic = 'force-dynamic'

type SearchMode = 'quick' | 'search' | 'deep'

const CATEGORY_DESCRIPTIONS: Record<DiscoverCategory, string> = {
  ai_apps: 'Useful app workflows worth investigating',
  search: 'Research threads with source-backed answers',
  code: 'Repos, implementations, and technical explainers',
  chat: 'Reusable question patterns for sharper answers',
  presentations: 'Decks and reports with a point of view'
}

const KIND_ICON: Record<DiscoverItemKind, typeof Sparkles> = {
  thread: MessageSquare,
  project: Code2,
  presentation: Presentation,
  prompt: Sparkles,
  api_session: TerminalSquare
}

const CURATED_PROMPTS = [
  {
    title: 'What changed in AI search quality this week?',
    query: 'What changed in AI search quality this week?',
    detail: 'Compare benchmarks, product launches, and independent analysis.',
    mode: 'search' as const,
    sources: ['arxiv.org', 'semianalysis.com', 'theverge.com']
  },
  {
    title: 'Which companies are turning agents into revenue?',
    query: 'Which companies are turning AI agents into revenue?',
    detail: 'Look for pricing, adoption signals, and credible customer proof.',
    mode: 'deep' as const,
    sources: ['sec.gov', 'stripe.com', 'company blogs']
  },
  {
    title: 'How are teams evaluating coding agents?',
    query: 'How are engineering teams evaluating coding agents?',
    detail:
      'Find real evaluation methods, failure modes, and workflow patterns.',
    mode: 'search' as const,
    sources: ['github.com', 'simonwillison.net', 'anthropic.com']
  }
]

function buildSearchHref(query: string, mode: SearchMode = 'search') {
  const params = new URLSearchParams()
  params.set('q', query)
  params.set('mode', mode)
  return `/search?${params.toString()}`
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

function getDomain(value: string) {
  if (value.startsWith('/')) return 'brok.app'
  try {
    return new URL(value).hostname.replace(/^www\./, '')
  } catch {
    return 'source'
  }
}

function getSourceLabel(item: DiscoverPublicItem) {
  if (item.kind === 'thread') return 'Public thread'
  if (item.kind === 'project') return 'Project'
  if (item.kind === 'presentation') return 'Deck'
  if (item.kind === 'api_session') return 'API session'
  return 'Prompt'
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

  const visibleCategories =
    activeCategory === 'all'
      ? categories
      : categories.filter(category => category.id === activeCategory)

  return (
    <main className="dashboard-shell min-h-svh px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="border-b pb-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <Badge variant="outline" className="mb-4 gap-2 bg-background">
                <Compass className="size-3.5" />
                Discover
              </Badge>
              <h1 className="max-w-3xl text-3xl font-semibold tracking-normal text-foreground sm:text-4xl">
                Research worth opening next
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                Curated prompts, public research threads, and source-aware
                starting points for faster answers in Brok Search.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 rounded-lg border bg-background p-2 text-center shadow-sm sm:min-w-80">
              <Metric label="Items" value={formatCount(data.totals.items)} />
              <Metric label="Likes" value={formatCount(data.totals.likes)} />
              <Metric label="Saves" value={formatCount(data.totals.saves)} />
            </div>
          </div>

          <form
            action="/search"
            className="mt-6 flex flex-col gap-2 rounded-lg border bg-background p-2 shadow-sm sm:flex-row"
          >
            <input type="hidden" name="mode" value="search" />
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                name="q"
                placeholder="Research a topic, company, paper, or question"
                className="border-0 pl-9 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>
            <Button type="submit" className="gap-2 sm:w-auto">
              Search
              <ArrowUpRight className="size-4" />
            </Button>
          </form>
        </header>

        <nav
          aria-label="Discover categories"
          className="flex gap-2 overflow-x-auto pb-1"
        >
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

        <section className="grid gap-3 lg:grid-cols-3">
          {CURATED_PROMPTS.map(prompt => (
            <CuratedPromptCard key={prompt.query} prompt={prompt} />
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-6">
            {data.featured.length > 0 ? (
              <FeedSection
                title="Editor picks"
                description="Human-curated examples and public work to use as research launchpads."
              >
                <div className="grid gap-3 md:grid-cols-2">
                  {data.featured.map(item => (
                    <DiscoverItemCard key={item.id} item={item} featured />
                  ))}
                </div>
              </FeedSection>
            ) : null}

            {visibleCategories.map(category => (
              <FeedSection
                key={category.id}
                title={category.label}
                description={category.description}
                action={
                  activeCategory === 'all' ? (
                    <Button asChild variant="ghost" size="sm" className="gap-1">
                      <Link href={`/discover?category=${category.id}`}>
                        View
                        <ArrowUpRight className="size-3.5" />
                      </Link>
                    </Button>
                  ) : null
                }
              >
                {category.items.length === 0 ? (
                  <EmptyState label="No public items in this section yet." />
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {category.items.map(item => (
                      <DiscoverItemCard key={item.id} item={item} />
                    ))}
                  </div>
                )}
              </FeedSection>
            ))}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <FeedSection
              title="Trending prompts"
              description="From public activity, framed as questions you can research now."
              compact
            >
              {data.trending.length === 0 ? (
                <EmptyState label="Trending topics will appear as public research activity grows." />
              ) : (
                <div className="space-y-2">
                  {data.trending.slice(0, 8).map(topic => (
                    <TrendingTopicLink key={topic.id} topic={topic} />
                  ))}
                </div>
              )}
            </FeedSection>

            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <FileText className="size-4 text-muted-foreground" />
                Source signals
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Domain chips show where an item points or which sources a
                curated prompt is designed to inspect. They are starting lenses,
                not live verification claims.
              </p>
            </div>
          </aside>
        </section>
      </div>
    </main>
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md px-2 py-2">
      <p className="text-lg font-semibold leading-none">{value}</p>
      <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
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
      className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors ${
        active
          ? 'border-foreground/20 bg-foreground text-background'
          : 'border-border/70 bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground'
      }`}
    >
      <Icon className="size-3.5" />
      {label}
    </Link>
  )
}

function FeedSection({
  title,
  description,
  action,
  compact = false,
  children
}: {
  title: string
  description: string
  action?: ReactNode
  compact?: boolean
  children: ReactNode
}) {
  return (
    <section className={compact ? 'space-y-3' : 'space-y-4'}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {description}
          </p>
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function CuratedPromptCard({
  prompt
}: {
  prompt: (typeof CURATED_PROMPTS)[number]
}) {
  return (
    <Link
      href={buildSearchHref(prompt.query, prompt.mode)}
      className="group rounded-lg border bg-background p-4 shadow-sm transition-colors hover:border-foreground/25"
    >
      <div className="flex items-start justify-between gap-3">
        <Badge variant="secondary" className="gap-1 text-[10px]">
          <Sparkles className="size-3" />
          Curated prompt
        </Badge>
        <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
      </div>
      <h2 className="mt-3 line-clamp-2 text-base font-semibold leading-6">
        {prompt.title}
      </h2>
      <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
        {prompt.detail}
      </p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {prompt.sources.map(source => (
          <SourceChip key={source} label={source} />
        ))}
      </div>
    </Link>
  )
}

function DiscoverItemCard({
  item,
  featured = false
}: {
  item: DiscoverPublicItem
  featured?: boolean
}) {
  const Icon = KIND_ICON[item.kind]
  const researchHref = buildSearchHref(item.title, featured ? 'deep' : 'search')
  return (
    <article className="group flex min-h-56 flex-col rounded-lg border bg-background p-4 shadow-sm transition-colors hover:border-foreground/25">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary" className="gap-1 text-[10px]">
            <Icon className="size-3" />
            {item.kind.replace('_', ' ')}
          </Badge>
          {featured ? (
            <Badge variant="outline" className="gap-1 text-[10px]">
              <Sparkles className="size-3" />
              Pick
            </Badge>
          ) : null}
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
          <Clock3 className="size-3" />
          {formatRelative(item.publishedAt)}
        </span>
      </div>

      <h3 className="mt-3 line-clamp-2 text-base font-semibold leading-6">
        <Link href={researchHref} className="hover:underline">
          {item.title}
        </Link>
      </h3>

      {item.summary ? (
        <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">
          {item.summary}
        </p>
      ) : (
        <p className="mt-2 text-sm italic leading-6 text-muted-foreground">
          Public item without a summary yet.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-1.5">
        <SourceChip label={getDomain(item.href)} />
        <SourceChip label={getSourceLabel(item)} />
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-5 text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <ThumbsUp className="size-3.5" />
            {formatCount(item.likeCount)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Bookmark className="size-3.5" />
            {formatCount(item.saveCount)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="h-8 gap-1 px-2">
            <Link href={item.href}>Open</Link>
          </Button>
          <Button asChild size="sm" className="h-8 gap-1 px-2">
            <Link href={researchHref}>
              Research
              <ArrowUpRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      </div>
    </article>
  )
}

function TrendingTopicLink({ topic }: { topic: TrendingTopic }) {
  return (
    <Link
      href={buildSearchHref(topic.label, 'search')}
      className="group flex items-center justify-between gap-3 rounded-lg border bg-background p-3 text-sm transition-colors hover:border-foreground/25"
    >
      <span className="min-w-0">
        <span className="line-clamp-2 font-medium">{topic.label}</span>
        <span className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
          <Flame className="size-3 text-muted-foreground" />
          {getDiscoverCategoryLabel(topic.category)} · {topic.velocity} signals
        </span>
      </span>
      <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
    </Link>
  )
}

function SourceChip({ label }: { label: string }) {
  return (
    <span className="inline-flex min-h-6 items-center gap-1 rounded-full border bg-muted/20 px-2 text-[11px] font-medium text-muted-foreground">
      <Globe2 className="size-3" />
      {label}
    </span>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed bg-muted/10 px-4 py-8 text-center text-sm text-muted-foreground">
      {label}
    </div>
  )
}
