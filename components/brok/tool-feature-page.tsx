import Link from 'next/link'

import {
  ArrowRight,
  Check,
  Code2,
  FileText,
  KeyRound,
  Mail,
  Presentation,
  Search,
  Sparkles,
  TerminalSquare
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { IconBlinkingLogo } from '@/components/ui/icons'

const ICONS = {
  check: Check,
  search: Search,
  code: Code2,
  mail: Mail,
  presentations: Presentation,
  api: KeyRound,
  key: KeyRound,
  docs: FileText,
  terminal: TerminalSquare
} as const

export type ToolFeature = {
  slug: string
  eyebrow: string
  title: string
  subtitle: string
  priceLine: string
  primaryHref: string
  primaryLabel: string
  secondaryHref: string
  secondaryLabel: string
  icon: keyof typeof ICONS
  visualTitle: string
  visualRows: { label: string; value: string }[]
  highlights: string[]
  workflows: { title: string; body: string; icon: keyof typeof ICONS }[]
}

export const TOOL_FEATURES: ToolFeature[] = [
  {
    slug: 'search',
    eyebrow: 'Brok Search',
    title: 'Answers students can actually cite.',
    subtitle:
      'Ask quick questions, run deep research, and keep sources attached so papers, labs, and projects do not turn into tab chaos.',
    priceLine: 'Included in the $7/month student plan.',
    primaryHref: '/',
    primaryLabel: 'Open Search',
    secondaryHref: '/search/demo',
    secondaryLabel: 'View demo',
    icon: 'search',
    visualTitle: 'Research brief',
    visualRows: [
      { label: 'Sources ranked', value: '12' },
      { label: 'Citations ready', value: 'Yes' },
      { label: 'Mode', value: 'Deep' }
    ],
    highlights: [
      'Perplexity-style answer surface with source cards',
      'Quick, search, code, and deep modes',
      'Follow-up questions and readable citations'
    ],
    workflows: [
      {
        title: 'Class research',
        body: 'Turn a vague topic into source-backed claims.',
        icon: 'search'
      },
      {
        title: 'Study help',
        body: 'Get concise explanations with enough context to trust.',
        icon: 'docs'
      },
      {
        title: 'Project decisions',
        body: 'Compare options and keep evidence visible.',
        icon: 'check'
      }
    ]
  },
  {
    slug: 'brokcode',
    eyebrow: 'BrokCode',
    title: 'A coding workspace for real assignments.',
    subtitle:
      'Generate, inspect, edit, and ship code with browser and terminal workflows built into the same student-friendly workspace.',
    priceLine: 'Coding help is part of the $7/month plan.',
    primaryHref: '/brokcode',
    primaryLabel: 'Open BrokCode',
    secondaryHref: '/docs/brokcode',
    secondaryLabel: 'Read docs',
    icon: 'code',
    visualTitle: 'Builder session',
    visualRows: [
      { label: 'Files changed', value: '8' },
      { label: 'Tests', value: 'Passing' },
      { label: 'Runtime', value: 'Live' }
    ],
    highlights: [
      'File-aware edits and project versions',
      'Safe terminal commands and Git context',
      'Browser preview loops for UI work'
    ],
    workflows: [
      {
        title: 'Debug a repo',
        body: 'Trace bugs from UI symptoms back to code.',
        icon: 'terminal'
      },
      {
        title: 'Build a feature',
        body: 'Iterate from prompt to working local preview.',
        icon: 'code'
      },
      {
        title: 'Prepare a PR',
        body: 'Run tests, summarize changes, and keep proof close.',
        icon: 'check'
      }
    ]
  },
  {
    slug: 'brokmail',
    eyebrow: 'BrokMail',
    title: 'Email and calendar work without the busywork.',
    subtitle:
      'Connect Gmail and Calendar, triage inboxes, draft replies, and keep class deadlines moving without losing the thread.',
    priceLine: 'Mail workflows are included in the $7/month plan.',
    primaryHref: '/brokmail',
    primaryLabel: 'Open BrokMail',
    secondaryHref: '/docs/brokmail',
    secondaryLabel: 'Read docs',
    icon: 'mail',
    visualTitle: 'Inbox run',
    visualRows: [
      { label: 'Drafts prepared', value: '6' },
      { label: 'Calendar checks', value: '3' },
      { label: 'Needs approval', value: 'Yes' }
    ],
    highlights: [
      'Gmail and Calendar connector workflows',
      'Approval-first actions for sensitive sends',
      'Email drafting grounded in user instructions'
    ],
    workflows: [
      {
        title: 'Reply faster',
        body: 'Draft respectful, context-aware email responses.',
        icon: 'mail'
      },
      {
        title: 'Plan deadlines',
        body: 'Connect due dates to calendar-aware next steps.',
        icon: 'check'
      },
      {
        title: 'Summarize threads',
        body: 'Extract decisions and pending tasks from long chains.',
        icon: 'docs'
      }
    ]
  },
  {
    slug: 'presentations',
    eyebrow: 'Brok Presentations',
    title: 'Turn research into a reveal.js deck.',
    subtitle:
      'Draft slide scripts, generate outlines, preview a real reveal.js deck, share a public link, and export HTML or Markdown.',
    priceLine: 'Presentation building is included in the $7/month plan.',
    primaryHref: '/presentations',
    primaryLabel: 'Open Presentations',
    secondaryHref: '/tools',
    secondaryLabel: 'View tools',
    icon: 'presentations',
    visualTitle: 'Deck preview',
    visualRows: [
      { label: 'Slides', value: '9' },
      { label: 'Engine', value: 'reveal.js' },
      { label: 'Exports', value: 'HTML + MD' }
    ],
    highlights: [
      'Editable Markdown slide source',
      'Live reveal.js preview and speaker notes',
      'Public share links for finished decks'
    ],
    workflows: [
      {
        title: 'Class presentation',
        body: 'Move from research notes to a coherent deck.',
        icon: 'presentations'
      },
      {
        title: 'Project update',
        body: 'Summarize progress, blockers, and next steps.',
        icon: 'docs'
      },
      {
        title: 'Demo day',
        body: 'Share a browser-ready deck without extra tooling.',
        icon: 'check'
      }
    ]
  },
  {
    slug: 'api',
    eyebrow: 'Brok API Platform',
    title: 'OpenAI-compatible APIs for student builders.',
    subtitle:
      'Create keys, call chat and search endpoints, track usage, and build projects without learning a new API shape.',
    priceLine: 'API access is included in the $7/month plan.',
    primaryHref: '/api-platform/keys',
    primaryLabel: 'Create API key',
    secondaryHref: '/docs/quickstart',
    secondaryLabel: 'Read quickstart',
    icon: 'api',
    visualTitle: 'API workspace',
    visualRows: [
      { label: 'Endpoints', value: '5' },
      { label: 'Auth', value: 'API key' },
      { label: 'Usage', value: 'Metered' }
    ],
    highlights: [
      'OpenAI-compatible chat completions',
      'Search completions with citation support',
      'Usage dashboards and scoped API keys'
    ],
    workflows: [
      {
        title: 'Build an app',
        body: 'Use familiar chat and search endpoints.',
        icon: 'api'
      },
      {
        title: 'Prototype safely',
        body: 'Scope keys and watch usage as projects grow.',
        icon: 'key'
      },
      {
        title: 'Ship a demo',
        body: 'Plug Brok into class projects or hackathon tools.',
        icon: 'terminal'
      }
    ]
  }
]

const FEATURE_SLUG_ALIASES: Record<string, string> = {
  'app-builder': 'brokcode',
  builder: 'brokcode',
  code: 'brokcode',
  'brok-code': 'brokcode',
  presentation: 'presentations',
  'brok-presentation': 'presentations',
  'brok-presentations': 'presentations',
  keys: 'api',
  'api-keys': 'api',
  platform: 'api'
}

export function resolveFeatureSlug(slug: string) {
  return FEATURE_SLUG_ALIASES[slug] ?? slug
}

export function getToolFeature(slug: string) {
  const resolvedSlug = resolveFeatureSlug(slug)
  return TOOL_FEATURES.find(feature => feature.slug === resolvedSlug)
}

export function ToolFeaturePage({ feature }: { feature: ToolFeature }) {
  const HeroIcon = ICONS[feature.icon]

  return (
    <main className="min-h-svh bg-[#dcdcdc] px-4 py-8 text-zinc-950 sm:px-6 lg:px-8">
      <section className="mx-auto flex min-h-[min(760px,calc(100svh-4rem))] w-full max-w-7xl flex-col overflow-hidden rounded-lg border border-white/80 bg-white shadow-[0_42px_90px_-58px_rgba(24,24,27,0.7)]">
        <FeatureNav />

        <div className="relative flex flex-1 flex-col overflow-hidden bg-[#fbfbfb]">
          <DotPattern />

          <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-5 py-14 text-center sm:px-8">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-600 shadow-sm">
              <HeroIcon className="size-3.5" />
              {feature.eyebrow}
            </div>

            <h1 className="max-w-4xl text-4xl font-semibold leading-[0.98] tracking-tight text-zinc-950 sm:text-6xl lg:text-7xl">
              {feature.title}
            </h1>

            <p className="mt-6 max-w-2xl text-sm leading-6 text-zinc-600 sm:text-base">
              {feature.subtitle}
            </p>

            <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
              <Sparkles className="size-3.5" />
              {feature.priceLine}
            </div>

            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <Button asChild size="lg" className="h-11 rounded-md px-6">
                <Link href={feature.primaryHref}>
                  {feature.primaryLabel}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-11 rounded-md bg-white px-6"
              >
                <Link href={feature.secondaryHref}>
                  {feature.secondaryLabel}
                </Link>
              </Button>
            </div>

            <ProductVisual feature={feature} />
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-4 px-1 py-5 md:grid-cols-3">
        {feature.workflows.map(item => {
          const ItemIcon = ICONS[item.icon]
          return (
            <article
              key={item.title}
              className="rounded-lg border border-zinc-200 bg-white p-5 shadow-[0_18px_40px_-34px_rgba(24,24,27,0.45)]"
            >
              <div className="mb-4 inline-flex size-10 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50">
                <ItemIcon className="size-5" />
              </div>
              <h2 className="text-base font-semibold tracking-normal">
                {item.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                {item.body}
              </p>
            </article>
          )
        })}
      </section>
    </main>
  )
}

export function FeaturesIndexPage() {
  return (
    <main className="min-h-svh bg-[#dcdcdc] px-4 py-8 text-zinc-950 sm:px-6 lg:px-8">
      <section className="mx-auto w-full max-w-7xl overflow-hidden rounded-lg border border-white/80 bg-white shadow-[0_42px_90px_-58px_rgba(24,24,27,0.7)]">
        <FeatureNav />

        <div className="relative overflow-hidden bg-[#fbfbfb] px-5 py-16 text-center sm:px-8">
          <DotPattern />
          <div className="relative z-10 mx-auto max-w-4xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-600 shadow-sm">
              <IconBlinkingLogo animate className="size-3.5" />
              Brok tools
            </div>
            <h1 className="text-4xl font-semibold leading-none tracking-tight sm:text-6xl">
              One $7/month workspace for every student workflow.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-sm leading-6 text-zinc-600 sm:text-base">
              Search, code, email, presentations, and API keys live in one
              simple product so students can move from question to finished
              project.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-4 px-1 py-5 md:grid-cols-2 xl:grid-cols-5">
        {TOOL_FEATURES.map(feature => {
          const FeatureIcon = ICONS[feature.icon]
          return (
            <Link
              key={feature.slug}
              href={`/features/${feature.slug}`}
              className="group rounded-lg border border-zinc-200 bg-white p-5 shadow-[0_18px_40px_-34px_rgba(24,24,27,0.45)] transition hover:border-zinc-300 hover:shadow-[0_24px_48px_-36px_rgba(24,24,27,0.55)]"
            >
              <div className="mb-4 inline-flex size-10 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50">
                <FeatureIcon className="size-5" />
              </div>
              <h2 className="text-base font-semibold tracking-normal">
                {feature.eyebrow}
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                {feature.subtitle}
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-zinc-950">
                Explore
                <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          )
        })}
      </section>
    </main>
  )
}

function FeatureNav() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-100 px-5 sm:px-7">
      <Link href="/" className="inline-flex items-center gap-2">
        <span className="inline-flex size-7 items-center justify-center rounded-md border border-zinc-200 bg-white shadow-sm">
          <IconBlinkingLogo animate className="size-3.5" />
        </span>
        <span className="text-sm font-semibold tracking-tight">Brok</span>
      </Link>

      <nav className="hidden items-center gap-6 md:flex">
        {TOOL_FEATURES.map(feature => (
          <Link
            key={feature.slug}
            href={`/features/${feature.slug}`}
            className="text-[11px] font-medium text-zinc-600 transition-colors hover:text-zinc-950"
          >
            {feature.eyebrow.replace('Brok ', '')}
          </Link>
        ))}
      </nav>

      <Button asChild size="sm" className="h-8 rounded-md px-3 text-xs">
        <Link href="/auth/login">Start for $7/mo</Link>
      </Button>
    </header>
  )
}

function ProductVisual({ feature }: { feature: ToolFeature }) {
  const HeroIcon = ICONS[feature.icon]

  return (
    <div className="mt-10 w-full max-w-3xl rounded-lg border border-zinc-200 bg-white p-3 text-left shadow-[0_32px_70px_-50px_rgba(24,24,27,0.75)]">
      <div className="flex items-center justify-between border-b border-zinc-100 px-2 pb-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-9 items-center justify-center rounded-lg bg-zinc-950 text-white">
            <HeroIcon className="size-4" />
          </span>
          <div>
            <div className="text-sm font-semibold">{feature.visualTitle}</div>
            <div className="text-xs text-zinc-500">Live product surface</div>
          </div>
        </div>
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
          Ready
        </span>
      </div>

      <div className="grid gap-3 px-2 py-4 sm:grid-cols-3">
        {feature.visualRows.map(row => (
          <div
            key={row.label}
            className="rounded-lg border border-zinc-100 p-3"
          >
            <div className="text-xs text-zinc-500">{row.label}</div>
            <div className="mt-1 text-sm font-semibold">{row.value}</div>
          </div>
        ))}
      </div>

      <ul className="grid gap-2 px-2 pb-2">
        {feature.highlights.map(highlight => (
          <li
            key={highlight}
            className="flex items-start gap-2 rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-700"
          >
            <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
            <span>{highlight}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function DotPattern() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 opacity-[0.33]"
      style={{
        backgroundImage:
          'radial-gradient(circle at 1px 1px, rgba(39,39,42,0.2) 1px, transparent 0)',
        backgroundSize: '11px 11px'
      }}
    />
  )
}
