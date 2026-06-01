import { SiGithub, SiGmail, SiLinear, SiNotion, SiSlack } from 'react-icons/si'
import Link from 'next/link'

import {
  ArrowRight,
  ArrowUpRight,
  Code2,
  FileText,
  Mail,
  Search
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { IconBlinkingLogo } from '@/components/ui/icons'

type BrokLandingProps = {
  isSignedIn: boolean
}

const GITHUB_URL = 'https://github.com/animvsh/broksearch-morphic'

const NAV_LINKS = [
  { label: 'Features', href: '/dashboard' },
  { label: 'BrokCode', href: '/brokcode' },
  { label: 'BrokMail', href: '/brokmail' },
  { label: 'Docs', href: '/docs' }
] as const

const INTEGRATION_LOGOS = [
  { Icon: SiGmail, color: '#EA4335' },
  { Icon: SiSlack, color: '#4A154B' },
  { Icon: SiGithub, color: '#181717' },
  { Icon: SiLinear, color: '#5E6AD2' },
  { Icon: SiNotion, color: '#000000' }
] as const

export function BrokLanding({ isSignedIn }: BrokLandingProps) {
  const primaryHref = isSignedIn ? '/auth/access-pending' : '/auth/login'

  return (
    <main className="dashboard-shell playful-canvas relative isolate min-h-[calc(100vh-3.25rem)] overflow-hidden">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 pt-6 sm:px-8">
        <Link href="/" className="brand-halo inline-flex items-center gap-2">
          <span className="brand-mark inline-flex size-8 items-center justify-center rounded-lg">
            <IconBlinkingLogo animate className="size-4" />
          </span>
          <span className="brand-wordmark text-base font-semibold tracking-tight">
            Brok
          </span>
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {NAV_LINKS.map(link => (
            <Link
              key={link.label}
              href={link.href}
              className="text-sm text-zinc-600 transition-colors hover:text-zinc-950"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href={isSignedIn ? '/auth/access-pending' : '/auth/login'}
            className="hidden text-sm font-medium text-zinc-700 hover:text-zinc-950 sm:inline"
          >
            Sign in
          </Link>
          <Button asChild size="sm" className="h-9 px-4 text-sm">
            <Link href={primaryHref}>Get started</Link>
          </Button>
        </div>
      </header>

      <section className="relative mx-auto w-full max-w-6xl px-5 pt-16 pb-28 sm:px-8 sm:pt-24">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 hidden lg:block"
        >
          <FloatingCard
            className="absolute top-4 left-2 w-64 -rotate-[3deg] sm:left-6"
            delay={0}
          >
            <FloatingStickyNote />
          </FloatingCard>
          <FloatingCard
            className="absolute top-8 right-2 w-60 rotate-[2deg] sm:right-6"
            delay={120}
          >
            <FloatingReminders />
          </FloatingCard>
          <FloatingCard
            className="absolute bottom-6 left-2 w-72 -rotate-[2deg] sm:left-6"
            delay={240}
          >
            <FloatingTasks />
          </FloatingCard>
          <FloatingCard
            className="absolute right-2 bottom-10 w-64 rotate-[3deg] sm:right-6"
            delay={360}
          >
            <FloatingIntegrations />
          </FloatingCard>
        </div>

        <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center text-center">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/80 px-3.5 py-1.5 text-sm text-zinc-700 shadow-[0_8px_30px_-12px_rgba(15,23,42,0.18)] backdrop-blur">
            <IconBlinkingLogo animate className="size-4" />
            <span className="font-medium">Brok</span>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white/90 px-4 py-3 shadow-[0_24px_60px_-30px_rgba(15,23,42,0.22)] backdrop-blur-md">
            <div className="flex w-72 items-center gap-2.5 sm:w-80">
              <Search className="size-4 text-zinc-400" />
              <span className="flex-1 text-left text-sm text-zinc-500">
                Ask Brok anything...
              </span>
              <span className="inline-flex size-6 items-center justify-center rounded-md bg-zinc-900 text-white">
                <ArrowRight className="size-3" />
              </span>
            </div>
          </div>

          <h1 className="mt-10 text-5xl font-semibold leading-[1.05] tracking-tight sm:text-7xl">
            <span className="text-zinc-950">Search, code, and connect</span>
            <br />
            <span className="font-normal text-zinc-400">all in one place</span>
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-8 text-zinc-500">
            One workspace for AI search with sources, coding agents, and email
            workflows. Behind one login.
          </p>

          <div className="mt-10">
            <Button asChild size="lg" className="group h-12 px-7 text-base">
              <Link href={primaryHref}>
                Get started
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-5 pb-16 sm:px-8">
        <ul className="grid gap-3 sm:grid-cols-3 lg:hidden">
          <ProductCardMobile
            title="Search"
            body="Fast answers with sources, citations, and deep research."
            icon={Search}
            href="/dashboard"
          />
          <ProductCardMobile
            title="BrokCode"
            body="A coding-agent workspace for browser, cloud, and TUI."
            icon={Code2}
            href="/brokcode"
          />
          <ProductCardMobile
            title="BrokMail"
            body="Connected Gmail workflows for triage and drafting."
            icon={Mail}
            href="/brokmail"
          />
        </ul>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-zinc-500">
          <FileText className="size-4" />
          <span>Also: the Brok API (OpenAI-compatible)</span>
          <span aria-hidden="true">·</span>
          <Link
            href="/docs/quickstart"
            className="inline-flex items-center gap-1 font-medium text-zinc-900 underline-offset-4 hover:underline"
          >
            Read the quickstart
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-zinc-200/80">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-5 py-6 text-sm text-zinc-500 sm:flex-row sm:px-8">
          <span>&copy; 2026 Brok</span>
          <nav className="flex items-center gap-5">
            <Link href="/docs" className="hover:text-zinc-900 hover:underline">
              Docs
            </Link>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="hover:text-zinc-900 hover:underline"
            >
              GitHub
            </a>
          </nav>
        </div>
      </footer>
    </main>
  )
}

function FloatingCard({
  className,
  children,
  delay = 0
}: {
  className?: string
  children: React.ReactNode
  delay?: number
}) {
  return (
    <div
      className={
        'rounded-lg border border-zinc-200/80 bg-white/95 p-4 shadow-[0_24px_50px_-30px_rgba(15,23,42,0.28)] backdrop-blur-sm transition-transform duration-300 ' +
        (className ?? '')
      }
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  )
}

function FloatingStickyNote() {
  return (
    <div className="-mx-2 -my-2 rotate-[-2deg] rounded-sm bg-[#fde68a] p-3 shadow-[0_8px_18px_-8px_rgba(120,53,15,0.25)]">
      <p className="font-['Caveat','Comic_Sans_MS',cursive] text-[13px] leading-snug text-zinc-800">
        Take notes to keep track of crucial details and meaningful next tasks
        with ease.
      </p>
    </div>
  )
}

function FloatingReminders() {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-medium text-zinc-500">
        <Mail className="size-3.5" />
        Reminders
      </div>
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-700">
          <Mail className="size-3.5" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-zinc-900">
            Today&apos;s meeting
          </div>
          <div className="text-xs text-zinc-500">9:00 - 10:00</div>
        </div>
      </div>
    </div>
  )
}

function FloatingTasks() {
  return (
    <div className="space-y-3">
      <div className="text-xs font-medium text-zinc-500">
        Today&apos;s tasks
      </div>
      <ul className="space-y-2.5">
        {[
          {
            label: 'New ideas for campaign',
            progress: 80,
            color: 'bg-emerald-500'
          },
          {
            label: 'Design WP 4.0',
            progress: 60,
            color: 'bg-amber-500'
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
      <div className="text-xs font-medium text-zinc-500">100+ Integrations</div>
      <div className="grid grid-cols-5 gap-2">
        {INTEGRATION_LOGOS.map(({ Icon, color }) => (
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

function ProductCardMobile({
  title,
  body,
  icon: Icon,
  href
}: {
  title: string
  body: string
  icon: React.ComponentType<{ className?: string }>
  href: string
}) {
  return (
    <li>
      <Link
        href={href}
        className="group relative flex h-full flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4 transition-all hover:border-zinc-300 hover:shadow-[0_8px_30px_-20px_rgba(15,23,42,0.2)]"
      >
        <ArrowUpRight className="absolute top-3 right-3 size-3.5 text-zinc-400 transition-all group-hover:text-zinc-700 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        <span className="inline-flex size-8 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700">
          <Icon className="size-4" />
        </span>
        <div className="text-sm font-semibold tracking-tight">{title}</div>
        <p className="text-xs leading-5 text-zinc-500">{body}</p>
      </Link>
    </li>
  )
}
