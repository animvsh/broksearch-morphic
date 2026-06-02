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
  ArrowUpRight,
  BadgeCheck,
  BookOpen,
  CalendarDays,
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

const PRODUCTS = [
  {
    title: 'Search',
    body: 'Fast answers with sources, citations, and deep research.',
    icon: Search,
    href: '/features/search',
    color: 'bg-blue-50 text-blue-700 border-blue-100'
  },
  {
    title: 'BrokCode',
    body: 'A coding-agent workspace for browser, cloud, and TUI.',
    icon: Code2,
    href: '/features/brokcode',
    color: 'bg-zinc-100 text-zinc-800 border-zinc-200'
  },
  {
    title: 'BrokMail',
    body: 'Connected Gmail workflows for triage and drafting.',
    icon: Mail,
    href: '/features/brokmail',
    color: 'bg-rose-50 text-rose-700 border-rose-100'
  },
  {
    title: 'Slides',
    body: 'Reveal.js decks from research notes, with sharing and export.',
    icon: Presentation,
    href: '/features/presentations',
    color: 'bg-amber-50 text-amber-700 border-amber-100'
  },
  {
    title: 'API',
    body: 'OpenAI-compatible keys, chat, search, usage, and playgrounds.',
    icon: KeyRound,
    href: '/features/api',
    color: 'bg-emerald-50 text-emerald-700 border-emerald-100'
  }
] as const

const OUTCOMES = [
  'Cite research',
  'Build assignments',
  'Write emails',
  'Create decks',
  'Ship APIs'
] as const

export function BrokLanding({ isSignedIn }: BrokLandingProps) {
  const primaryHref = isSignedIn ? '/auth/access-pending' : '/auth/login'

  return (
    <main className="min-h-svh bg-[#d9d9d9] px-3 py-4 text-zinc-950 sm:px-5 sm:py-6 lg:px-8">
      <section className="mx-auto flex min-h-[min(780px,calc(100svh-3rem))] w-full max-w-7xl flex-col overflow-hidden rounded-lg border border-white/80 bg-white shadow-[0_46px_110px_-72px_rgba(24,24,27,0.82)]">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-100 px-4 sm:px-7">
          <Link href="/" className="inline-flex items-center gap-2">
            <span className="inline-flex size-7 items-center justify-center rounded-md border border-zinc-200 bg-white shadow-sm">
              <IconBlinkingLogo animate className="size-3.5" />
            </span>
            <span className="text-sm font-semibold tracking-tight">Brok</span>
          </Link>

          <nav className="hidden items-center gap-6 lg:flex">
            {NAV_LINKS.map(link => (
              <Link
                key={link.label}
                href={link.href}
                className="text-[11px] font-medium text-zinc-600 transition-colors hover:text-zinc-950"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href={isSignedIn ? '/auth/access-pending' : '/auth/login'}
              className="hidden text-[11px] font-medium text-zinc-600 hover:text-zinc-950 sm:inline"
            >
              Sign in
            </Link>
            <Button asChild size="sm" className="h-8 rounded-md px-3 text-xs">
              <Link href={primaryHref}>Start for $7/mo</Link>
            </Button>
          </div>
        </header>

        <div className="relative flex flex-1 flex-col overflow-hidden bg-[#fbfbfb]">
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-[0.28]"
            style={{
              backgroundImage:
                'radial-gradient(circle at 1px 1px, rgba(39,39,42,0.2) 1px, transparent 0)',
              backgroundSize: '11px 11px'
            }}
          />

          <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-8 sm:px-7 lg:px-9 lg:py-10">
            <div className="mx-auto flex w-full max-w-4xl flex-col items-center text-center">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-600 shadow-sm">
                <BadgeCheck className="size-3.5 text-emerald-600" />
                All five student AI tools for $7/month
              </div>

              <h1 className="max-w-5xl text-4xl font-semibold leading-[0.94] tracking-tight text-zinc-950 sm:text-6xl lg:text-7xl">
                One campus AI workspace
                <br />
                <span className="font-normal text-zinc-400">
                  for the price of lunch
                </span>
              </h1>

              <p className="mt-6 max-w-2xl text-sm leading-6 text-zinc-600 sm:text-base">
                Brok bundles cited search, coding help, email workflows,
                reveal.js presentations, and OpenAI-compatible APIs into one
                simple student plan.
              </p>

              <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                <Button
                  asChild
                  size="lg"
                  className="group h-11 rounded-md px-6"
                >
                  <Link href={primaryHref}>
                    Start for $7/mo
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
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

              <div className="mt-8 w-full overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-[0_28px_72px_-42px_rgba(24,24,27,0.72)]">
                <Image
                  src="/images/brok-landing-hero.webp"
                  alt="Students using Brok tools across research, coding, mail, and presentations"
                  width={1600}
                  height={900}
                  className="h-auto w-full object-cover"
                  priority
                />
              </div>
            </div>

            <div className="mt-9 grid gap-4 lg:grid-cols-[0.72fr_1.28fr_0.72fr] lg:items-center">
              <div className="hidden space-y-4 lg:block">
                <FloatingCard>
                  <FloatingStickyNote />
                </FloatingCard>
                <FloatingCard>
                  <FloatingTasks />
                </FloatingCard>
              </div>

              <ProductConsole />

              <div className="hidden space-y-4 lg:block">
                <FloatingCard>
                  <FloatingReminders />
                </FloatingCard>
                <FloatingCard>
                  <FloatingIntegrations />
                </FloatingCard>
              </div>
            </div>

            <ul className="mt-6 grid gap-2 sm:grid-cols-5">
              {OUTCOMES.map(outcome => (
                <li
                  key={outcome}
                  className="flex items-center justify-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-600 shadow-sm"
                >
                  <Check className="size-3.5 text-emerald-600" />
                  {outcome}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-4 px-1 py-5 md:grid-cols-5">
        {PRODUCTS.map(product => (
          <ProductCard key={product.title} {...product} />
        ))}
      </section>

      <section
        id="pricing"
        className="mx-auto grid w-full max-w-7xl gap-4 px-1 pb-6 lg:grid-cols-[1.05fr_0.95fr]"
      >
        <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-[0_24px_55px_-42px_rgba(24,24,27,0.72)] sm:p-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
            <Sparkles className="size-3.5" />
            Only $7/month
          </div>
          <h2 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">
            Cheap enough for students. Useful enough for the whole semester.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">
            One subscription covers research, building, communication,
            presentations, and API projects. No separate upsells for the tools
            students actually need.
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
              <Link href="/docs/quickstart">Read quickstart</Link>
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-[0_24px_55px_-42px_rgba(24,24,27,0.72)] sm:p-6">
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-semibold tracking-tight">$7</span>
            <span className="text-sm font-medium text-zinc-500">per month</span>
          </div>
          <ul className="mt-5 grid gap-3">
            {[
              'AI search with citations',
              'BrokCode builder workspace',
              'BrokMail and calendar workflows',
              'Reveal.js presentation builder',
              'OpenAI-compatible API platform'
            ].map(item => (
              <li key={item} className="flex items-start gap-2 text-sm">
                <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-1 pb-6">
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-zinc-600">
          <FileText className="size-4" />
          <span>Brok API is included in the $7/month plan</span>
          <span aria-hidden="true">&middot;</span>
          <Link
            href="/docs/quickstart"
            className="inline-flex items-center gap-1 font-medium text-zinc-950 underline-offset-4 hover:underline"
          >
            Read the quickstart
            <ArrowRight className="size-3.5" />
          </Link>
        </div>

        <footer className="mt-5 flex flex-col items-center justify-between gap-2 text-sm text-zinc-600 sm:flex-row">
          <span>&copy; 2026 Brok</span>
          <nav className="flex items-center gap-5">
            <Link href="/docs" className="hover:text-zinc-950 hover:underline">
              Docs
            </Link>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="hover:text-zinc-950 hover:underline"
            >
              GitHub
            </a>
          </nav>
        </footer>
      </section>
    </main>
  )
}

function ProductConsole() {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 shadow-[0_36px_75px_-52px_rgba(24,24,27,0.85)]">
      <div className="flex items-center justify-between border-b border-zinc-100 px-2 pb-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-9 items-center justify-center rounded-md bg-zinc-950 text-white">
            <IconBlinkingLogo animate className="size-4" />
          </span>
          <div>
            <div className="text-sm font-semibold">Student workspace</div>
            <div className="text-xs text-zinc-500">Live tools included</div>
          </div>
        </div>
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
          $7/mo
        </span>
      </div>

      <div className="grid gap-3 p-2 sm:grid-cols-2">
        {[
          {
            icon: Search,
            title: 'Cited answer',
            body: '8 sources ranked for a history paper',
            color: 'bg-blue-50 text-blue-700'
          },
          {
            icon: TerminalSquare,
            title: 'Code run',
            body: 'Tests passing after a bug fix',
            color: 'bg-zinc-100 text-zinc-800'
          },
          {
            icon: CalendarDays,
            title: 'Mail plan',
            body: 'Draft reply plus lab deadline reminder',
            color: 'bg-rose-50 text-rose-700'
          },
          {
            icon: BookOpen,
            title: 'Deck outline',
            body: 'Reveal.js slides ready to present',
            color: 'bg-amber-50 text-amber-700'
          }
        ].map(item => (
          <div
            key={item.title}
            className="rounded-lg border border-zinc-100 p-3"
          >
            <span
              className={`inline-flex size-8 items-center justify-center rounded-md ${item.color}`}
            >
              <item.icon className="size-4" />
            </span>
            <div className="mt-3 text-sm font-semibold">{item.title}</div>
            <p className="mt-1 text-xs leading-5 text-zinc-500">{item.body}</p>
          </div>
        ))}
      </div>

      <div className="mx-2 mb-2 rounded-lg border border-zinc-100 bg-zinc-50 p-3">
        <div className="flex items-center justify-between text-xs font-medium text-zinc-500">
          <span>Today&apos;s progress</span>
          <span>82%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
          <div className="h-full w-[82%] rounded-full bg-emerald-500" />
        </div>
      </div>
    </div>
  )
}

function FloatingCard({
  className,
  children
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={
        'rounded-lg border border-zinc-200/80 bg-white/95 p-4 shadow-[0_24px_50px_-30px_rgba(15,23,42,0.36)] backdrop-blur-sm ' +
        (className ?? '')
      }
    >
      {children}
    </div>
  )
}

function FloatingStickyNote() {
  return (
    <div className="-mx-2 -my-2 rotate-[-2deg] rounded-sm bg-[#fde68a] p-3 shadow-[0_8px_18px_-8px_rgba(120,53,15,0.25)]">
      <p className="font-['Caveat','Comic_Sans_MS',cursive] text-[13px] leading-snug text-zinc-800">
        One plan for research, code, email, slides, and API projects.
      </p>
    </div>
  )
}

function FloatingReminders() {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-medium text-zinc-500">
        <Mail className="size-3.5" />
        Class reminders
      </div>
      <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-2">
        <div className="truncate text-sm font-medium text-zinc-900">
          Lab due tonight
        </div>
        <div className="text-xs text-zinc-500">Draft email, add calendar</div>
      </div>
    </div>
  )
}

function FloatingTasks() {
  return (
    <div className="space-y-3">
      <div className="text-xs font-medium text-zinc-500">Today&apos;s work</div>
      <ul className="space-y-2.5">
        {[
          {
            label: 'Find sources for paper',
            progress: 82,
            color: 'bg-blue-500'
          },
          {
            label: 'Fix project bug',
            progress: 64,
            color: 'bg-emerald-500'
          }
        ].map(task => (
          <li key={task.label} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-800">{task.label}</span>
              <span className="font-medium text-zinc-500">
                {task.progress}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
              <div
                className={`h-full ${task.color}`}
                style={{ width: `${task.progress}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function FloatingIntegrations() {
  return (
    <div className="space-y-3">
      <div className="text-xs font-medium text-zinc-500">
        Integrations included
      </div>
      <div className="grid grid-cols-5 gap-2">
        {[
          { Icon: SiGmail, color: '#EA4335' },
          { Icon: SiSlack, color: '#4A154B' },
          { Icon: SiGooglecalendar, color: '#4285F4' },
          { Icon: SiGithub, color: '#181717' },
          { Icon: SiGooglecloud, color: '#34A853' }
        ].map(({ Icon, color }) => (
          <span
            key={color}
            className="inline-flex size-9 items-center justify-center rounded-lg border border-zinc-200 bg-white"
            style={{ color }}
          >
            <Icon className="size-4" />
          </span>
        ))}
      </div>
    </div>
  )
}

function ProductCard({
  title,
  body,
  icon: Icon,
  href,
  color
}: {
  title: string
  body: string
  icon: React.ComponentType<{ className?: string }>
  href: string
  color: string
}) {
  return (
    <Link
      href={href}
      className="group relative flex h-full min-h-44 flex-col rounded-lg border border-zinc-200 bg-white p-4 shadow-[0_18px_40px_-34px_rgba(24,24,27,0.45)] transition hover:border-zinc-300 hover:shadow-[0_24px_52px_-38px_rgba(24,24,27,0.62)]"
    >
      <ArrowUpRight className="absolute right-3 top-3 size-3.5 text-zinc-400 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-zinc-700" />
      <span
        className={`inline-flex size-10 items-center justify-center rounded-lg border ${color}`}
      >
        <Icon className="size-5" />
      </span>
      <div className="mt-4 text-sm font-semibold tracking-tight">{title}</div>
      <p className="mt-2 text-xs leading-5 text-zinc-500">{body}</p>
      <span className="mt-auto pt-4 text-xs font-medium text-zinc-950">
        Explore
      </span>
    </Link>
  )
}
