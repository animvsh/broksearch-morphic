import { SiGithub, SiGmail, SiGooglecalendar, SiSlack } from 'react-icons/si'
import Link from 'next/link'

import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Code2,
  FileText,
  Mail,
  Search,
  Sparkles
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { IconBlinkingLogo } from '@/components/ui/icons'

type BrokLandingProps = {
  isSignedIn: boolean
}

const GITHUB_URL = 'https://github.com/animvsh/broksearch-morphic'

const NAV_LINKS = [
  { label: 'Features', href: '/features' },
  { label: 'BrokCode', href: '/features/brokcode' },
  { label: 'BrokMail', href: '/features/brokmail' },
  { label: 'Pricing', href: '#pricing' }
] as const

const MOBILE_PRODUCTS = [
  {
    title: 'Search',
    body: 'Fast answers with sources, citations, and deep research.',
    icon: Search,
    href: '/features/search'
  },
  {
    title: 'BrokCode',
    body: 'A coding-agent workspace for browser, cloud, and TUI.',
    icon: Code2,
    href: '/features/brokcode'
  },
  {
    title: 'BrokMail',
    body: 'Connected Gmail workflows for triage and drafting.',
    icon: Mail,
    href: '/features/brokmail'
  }
] as const

export function BrokLanding({ isSignedIn }: BrokLandingProps) {
  const primaryHref = isSignedIn ? '/auth/access-pending' : '/auth/login'

  return (
    <main className="min-h-svh bg-[#dcdcdc] px-4 py-8 text-zinc-950 sm:px-6 lg:px-8">
      <section className="mx-auto flex min-h-[min(760px,calc(100svh-4rem))] w-full max-w-7xl flex-col overflow-hidden rounded-lg border border-white/80 bg-white shadow-[0_42px_90px_-58px_rgba(24,24,27,0.7)]">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-100 px-5 sm:px-7">
          <Link href="/" className="inline-flex items-center gap-2">
            <span className="inline-flex size-7 items-center justify-center rounded-md border border-zinc-200 bg-white shadow-sm">
              <IconBlinkingLogo animate className="size-3.5" />
            </span>
            <span className="text-sm font-semibold tracking-tight">Brok</span>
          </Link>

          <nav className="hidden items-center gap-8 md:flex">
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
              <Link href={primaryHref}>Request invite</Link>
            </Button>
          </div>
        </header>

        <div className="relative flex flex-1 flex-col overflow-hidden bg-[#fbfbfb]">
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-[0.33]"
            style={{
              backgroundImage:
                'radial-gradient(circle at 1px 1px, rgba(39,39,42,0.2) 1px, transparent 0)',
              backgroundSize: '11px 11px'
            }}
          />

          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 hidden lg:block"
          >
            <FloatingCard className="absolute left-10 top-14 w-52 -rotate-[4deg]">
              <FloatingStickyNote />
            </FloatingCard>

            <div className="absolute -left-8 top-60 -rotate-[5deg]">
              <MiniCheckCard />
            </div>

            <FloatingCard className="absolute right-12 top-12 w-44 rotate-[7deg]">
              <FloatingReminders />
            </FloatingCard>

            <FloatingCard className="absolute bottom-8 left-9 w-72 -rotate-[1.5deg]">
              <FloatingTasks />
            </FloatingCard>

            <FloatingCard className="absolute right-16 bottom-10 w-64 rotate-[3deg]">
              <FloatingIntegrations />
            </FloatingCard>
          </div>

          <div className="relative z-10 mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center px-5 py-16 text-center sm:px-8">
            <div className="mb-9 inline-flex size-16 items-center justify-center rounded-lg border border-zinc-200 bg-white shadow-[0_18px_45px_-28px_rgba(24,24,27,0.5)]">
              <IconBlinkingLogo animate className="size-7" />
            </div>

            <h1 className="max-w-4xl text-4xl font-semibold leading-[0.98] tracking-tight text-zinc-950 sm:text-6xl lg:text-7xl">
              Search, code, and ship <br />
              <span className="font-normal text-zinc-400">
                all in one place
              </span>
            </h1>

            <p className="mt-7 max-w-xl text-sm leading-6 text-zinc-600 sm:text-base">
              Brok gives students AI search, BrokCode, BrokMail, and an
              OpenAI-compatible API workspace for one simple price.
            </p>

            <div
              id="pricing"
              className="mt-5 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700"
            >
              <Sparkles className="size-3.5" />
              Only $7/month
            </div>

            <div className="mt-7">
              <Button asChild size="lg" className="group h-11 rounded-md px-6">
                <Link href={primaryHref}>
                  Request invite
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-1 py-5">
        <ul className="grid gap-3 lg:hidden">
          {MOBILE_PRODUCTS.map(product => (
            <ProductCardMobile key={product.title} {...product} />
          ))}
        </ul>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-zinc-600">
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
        Save research, code context, and email tasks in one student-friendly
        workspace.
      </p>
    </div>
  )
}

function MiniCheckCard() {
  return (
    <div className="flex size-20 items-center justify-center rounded-lg border border-zinc-200 bg-white shadow-[0_24px_50px_-34px_rgba(24,24,27,0.5)]">
      <span className="inline-flex size-10 items-center justify-center rounded-lg bg-blue-500 text-white shadow-sm">
        <Check className="size-5" />
      </span>
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
      <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-2">
        <div className="truncate text-sm font-medium text-zinc-900">
          Lab due tonight
        </div>
        <div className="text-xs text-zinc-500">BrokMail can draft it</div>
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
        Tools included for $7
      </div>
      <div className="grid grid-cols-4 gap-2">
        {[
          { Icon: SiGmail, color: '#EA4335' },
          { Icon: SiSlack, color: '#4A154B' },
          { Icon: SiGooglecalendar, color: '#4285F4' },
          { Icon: SiGithub, color: '#181717' }
        ].map(({ Icon, color }) => (
          <span
            key={color}
            className="inline-flex size-10 items-center justify-center rounded-lg border border-zinc-200 bg-white"
            style={{ color }}
          >
            <Icon className="size-5" />
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
        className="group relative flex h-full flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-4 transition-all hover:border-zinc-300 hover:shadow-[0_8px_30px_-20px_rgba(15,23,42,0.2)]"
      >
        <ArrowUpRight className="absolute right-3 top-3 size-3.5 text-zinc-400 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-zinc-700" />
        <span className="inline-flex size-8 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700">
          <Icon className="size-4" />
        </span>
        <div className="text-sm font-semibold tracking-tight">{title}</div>
        <p className="text-xs leading-5 text-zinc-500">{body}</p>
      </Link>
    </li>
  )
}
