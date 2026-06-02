import type { ComponentType } from 'react'
import {
  SiGithub,
  SiGmail,
  SiGooglecalendar,
  SiGooglecloud,
  SiSlack
} from 'react-icons/si'
import Image from 'next/image'
import Link from 'next/link'

import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  CalendarDays,
  Check,
  Code2,
  Eye,
  FileText,
  KeyRound,
  Mail,
  Presentation,
  Search,
  Sparkles,
  TerminalSquare,
  Users
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { IconBlinkingLogo } from '@/components/ui/icons'

type BrokLandingProps = {
  isSignedIn: boolean
}

const GITHUB_URL = 'https://github.com/animvsh/broksearch-morphic'

const NAV_LINKS = [
  { label: 'Features', href: '/features' },
  { label: 'Search', href: '/features/search' },
  { label: 'Code', href: '/features/brokcode' },
  { label: 'Presentations', href: '/features/presentations' },
  { label: 'Pricing', href: '/pricing' }
] as const

const CORE_TOOLS = [
  {
    title: 'Search',
    body: 'Cited research answers with sources and follow-up prompts.',
    icon: Search,
    href: '/features/search',
    accent: 'text-blue-700',
    tag: 'Research'
  },
  {
    title: 'BrokCode',
    body: 'Code generation, file editing, terminal commands, and live preview.',
    icon: Code2,
    href: '/features/brokcode',
    accent: 'text-zinc-800',
    tag: 'Assignments'
  },
  {
    title: 'BrokMail',
    body: 'Gmail and calendar workflows for triage, summary, and drafts.',
    icon: Mail,
    href: '/features/brokmail',
    accent: 'text-rose-700',
    tag: 'Productivity'
  },
  {
    title: 'Presentations',
    body: 'Import notes, shape an outline, and generate reveal.js slides.',
    icon: Presentation,
    href: '/features/presentations',
    accent: 'text-amber-700',
    tag: 'Demo ready'
  },
  {
    title: 'API Platform',
    body: 'Use one key for chat, search, and usage-aware app integrations.',
    icon: KeyRound,
    href: '/features/api',
    accent: 'text-emerald-700',
    tag: 'Developers'
  }
] as const

const WORKFLOW_STEPS = [
  {
    icon: Search,
    title: 'Ask a question',
    detail: 'Start with your assignment, email, or project goal.'
  },
  {
    icon: Code2,
    title: 'Build the next action',
    detail:
      'Generate code, email drafts, or slide drafts in the same workspace.'
  },
  {
    icon: CalendarDays,
    title: 'Ship with confidence',
    detail: 'Review, edit, and share finished artifacts with your class team.'
  }
] as const

const PLAN_BULLETS = [
  'Search with citations and source history',
  'BrokCode builder with browser and file workflows',
  'BrokMail triage and draft actions',
  'Reveal.js deck creation + sharing',
  'OpenAI-compatible API platform'
] as const

const PRODUCT_STATS = [
  { label: 'Tools in plan', value: '5' },
  { label: 'Students covered', value: 'All workflows' },
  { label: 'Monthly price', value: '$7' }
] as const

export function BrokLanding({ isSignedIn }: BrokLandingProps) {
  const primaryHref = isSignedIn ? '/auth/access-pending' : '/auth/login'

  return (
    <main className="min-h-svh bg-[#efefef] px-3 py-4 text-zinc-950 sm:px-5 sm:py-6 lg:px-8">
      <section className="mx-auto flex w-full max-w-7xl flex-col overflow-hidden rounded-lg border border-white/80 bg-white shadow-[0_44px_110px_-72px_rgba(24,24,27,0.85)]">
        <header className="flex h-14 items-center justify-between border-b border-zinc-100 px-4 sm:px-7">
          <Link href="/" className="inline-flex items-center gap-2">
            <span className="inline-flex size-8 items-center justify-center rounded-md border border-zinc-200 bg-white shadow-sm">
              <IconBlinkingLogo animate className="size-4" />
            </span>
            <span className="text-sm font-semibold tracking-tight">Brok</span>
          </Link>

          <nav className="hidden items-center gap-5 lg:flex">
            {NAV_LINKS.map(link => (
              <Link
                key={link.label}
                href={link.href}
                className="text-xs font-medium text-zinc-600 transition-colors hover:text-zinc-950"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <Button asChild size="sm" className="h-8 rounded-md px-3 text-xs">
            <Link href={primaryHref}>Start for $7/mo</Link>
          </Button>
        </header>

        <div className="relative bg-[#fbfbfb] px-4 pb-10 pt-8 sm:px-7 sm:pb-12 sm:pt-10">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-full opacity-[0.2]"
            style={{
              background:
                'radial-gradient(circle at 0 0, rgba(34,197,94,0.16), transparent 46%), radial-gradient(circle at 100% 0, rgba(59,130,246,0.14), transparent 36%), radial-gradient(circle at 100% 100%, rgba(168,85,247,0.08), transparent 44%)'
            }}
          />

          <div className="relative mx-auto grid w-full max-w-6xl gap-7 lg:grid-cols-[1fr_0.92fr] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-600 shadow-sm">
                <BadgeCheck className="size-3.5 text-emerald-600" />
                All AI tools students need, for one plan
              </div>

              <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-[1.01] tracking-tight sm:text-6xl">
                Your whole campus workflow.
                <span className="block text-zinc-400">
                  One plan for search, code, mail, and decks.
                </span>
              </h1>

              <p className="mt-5 max-w-2xl text-sm leading-6 text-zinc-600 sm:text-base">
                Brok combines cited research, a coding workspace, mail
                workflows, presentation building, and API access into one
                unified student experience.
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                <Button asChild size="lg" className="h-11 rounded-md px-6">
                  <Link href={primaryHref}>
                    Start for $7/mo
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-11 rounded-md bg-white px-6"
                >
                  <Link href="/features">Explore tools</Link>
                </Button>
              </div>

              <div className="mt-8 grid grid-cols-3 gap-3 text-xs sm:grid-cols-1 sm:divide-x sm:divide-zinc-200 sm:border sm:rounded-lg sm:border-zinc-200 sm:bg-white sm:p-3">
                {PRODUCT_STATS.map(stat => (
                  <div
                    key={stat.label}
                    className="rounded-lg border border-zinc-200 bg-white p-3 sm:border-0 sm:p-0 sm:pl-4"
                  >
                    <div className="text-xl font-semibold text-zinc-900">
                      {stat.value}
                    </div>
                    <div className="text-[11px] text-zinc-600">
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white p-3 shadow-[0_28px_72px_-42px_rgba(24,24,27,0.72)]">
              <Image
                src="/images/brok-landing-hero.webp"
                alt="Students using Brok across search, coding, mail, and presentation flows"
                width={1600}
                height={900}
                className="h-auto w-full rounded-sm border border-zinc-200 object-cover"
                priority
              />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-4 px-1 py-5 md:grid-cols-2 xl:grid-cols-5">
        {CORE_TOOLS.map(tool => (
          <ProductCard
            key={tool.title}
            title={tool.title}
            body={tool.body}
            icon={tool.icon}
            href={tool.href}
            color="bg-white"
            accent={tool.accent}
            tag={tool.tag}
          />
        ))}
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-4 px-1 py-2 md:grid-cols-3">
        {WORKFLOW_STEPS.map(step => (
          <article
            key={step.title}
            className="rounded-lg border border-zinc-200 bg-white p-4 shadow-[0_18px_40px_-34px_rgba(24,24,27,0.45)]"
          >
            <div className="inline-flex size-10 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50">
              <step.icon className="size-4 text-zinc-800" />
            </div>
            <h2 className="mt-4 text-sm font-semibold">{step.title}</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              {step.detail}
            </p>
          </article>
        ))}
      </section>

      <section
        id="pricing"
        className="mx-auto grid w-full max-w-7xl gap-4 px-1 pb-6 lg:grid-cols-[1.05fr_0.95fr]"
      >
        <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-[0_24px_55px_-42px_rgba(24,24,27,0.72)] sm:p-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
            <Sparkles className="size-3.5" />
            One price, all core tools
          </div>
          <h2 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">
            $7/month for students, built for classrooms.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">
            One plan includes search, BrokCode, BrokMail, presentation output,
            and API access. No add-on upsells. No tool-by-tool billing.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button asChild size="lg" className="h-11 rounded-md px-6">
              <Link href={primaryHref}>
                Start for $7/mo
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-11 rounded-md bg-white px-6"
            >
              <Link href="/features">See features</Link>
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-[0_24px_55px_-42px_rgba(24,24,27,0.72)] sm:p-6">
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-semibold tracking-tight">$7</span>
            <span className="text-sm font-medium text-zinc-500">per month</span>
          </div>
          <ul className="mt-5 grid gap-3">
            {PLAN_BULLETS.map(item => (
              <li key={item} className="flex items-start gap-2 text-sm">
                <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <div className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            Cancel when your semester ends. No hidden compute charges in this
            plan.
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-1 pb-6">
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-[0_12px_35px_-32px_rgba(24,24,27,0.65)]">
          <div className="mb-3 flex items-center gap-2 text-sm text-zinc-600">
            <Users className="size-4" />
            Built for students and class teams
          </div>
          <div className="grid gap-2 text-sm text-zinc-600 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
            <div className="flex items-start gap-2">
              <Eye className="size-4 shrink-0 text-zinc-400" /> Works as one
              workspace on desktop and mobile.
            </div>
            <div className="flex items-start gap-2">
              <BookOpen className="size-4 shrink-0 text-zinc-400" /> Keep
              citations and code context together.
            </div>
            <div className="flex items-start gap-2">
              <TerminalSquare className="size-4 shrink-0 text-zinc-400" /> Share
              runtime-ready coding context.
            </div>
            <div className="flex items-start gap-2">
              <Mail className="size-4 shrink-0 text-zinc-400" /> Draft, send,
              and schedule with approvals.
            </div>
            <div className="flex items-start gap-2">
              <Presentation className="size-4 shrink-0 text-zinc-400" /> Present
              with reveal.js in one click.
            </div>
            <div className="flex items-start gap-2">
              <KeyRound className="size-4 shrink-0 text-zinc-400" /> Generate
              keys and track API usage.
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-sm text-zinc-500">
            <div className="inline-flex items-center gap-2">
              <FileText className="size-4" />
              Brok API is included in the plan
            </div>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
            >
              GitHub
              <ArrowRight className="size-3.5" />
            </a>
          </div>

          <div className="mt-4 grid gap-3 border-t border-zinc-200 pt-4 text-xs text-zinc-500 sm:grid-cols-4">
            {[
              { Icon: SiGmail, color: '#EA4335', label: 'Gmail' },
              { Icon: SiSlack, color: '#4A154B', label: 'Slack' },
              { Icon: SiGooglecalendar, color: '#4285F4', label: 'Calendar' },
              { Icon: SiGithub, color: '#181717', label: 'GitHub' },
              { Icon: SiGooglecloud, color: '#34A853', label: 'Cloud' }
            ].map(integration => (
              <span
                key={integration.label}
                className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1"
                style={{ color: integration.color }}
              >
                <integration.Icon className="size-3.5" />
                {integration.label}
              </span>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}

type ProductCardProps = {
  title: string
  body: string
  icon: ComponentType<{ className?: string }>
  href: string
  color: string
  accent: string
  tag: string
}

function ProductCard({
  title,
  body,
  icon: Icon,
  href,
  color,
  accent,
  tag
}: ProductCardProps) {
  return (
    <Link
      href={href}
      className={`group relative flex h-full flex-col rounded-lg border border-zinc-200 ${color} p-4 shadow-[0_18px_40px_-34px_rgba(24,24,27,0.45)] transition hover:border-zinc-300 hover:shadow-[0_24px_52px_-38px_rgba(24,24,27,0.62)]`}
    >
      <div
        className={`text-xs font-semibold uppercase tracking-wide ${accent}`}
      >
        {tag}
      </div>
      <Icon className={`mt-4 inline-flex size-7 ${accent}`} />
      <div className="mt-4 text-sm font-semibold tracking-tight">{title}</div>
      <p className="mt-2 text-xs leading-5 text-zinc-500">{body}</p>
      <span className="mt-auto pt-4 text-xs font-medium text-zinc-950">
        Open {title}
      </span>
      <ArrowRight className="absolute right-4 top-4 size-4 text-zinc-400 opacity-0 transition group-hover:opacity-100" />
    </Link>
  )
}
