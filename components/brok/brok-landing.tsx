import Link from 'next/link'

import {
  ArrowRight,
  ArrowUpRight,
  Code2,
  Mail,
  Plug,
  Search
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { IconBlinkingLogo } from '@/components/ui/icons'

type BrokLandingProps = {
  isSignedIn: boolean
}

const PRODUCTS = [
  {
    title: 'Chat & Search',
    body: 'Fast answers with citations, source review, and deep research jobs.',
    icon: Search,
    href: '/dashboard'
  },
  {
    title: 'BrokCode',
    body: 'A coding-agent workspace for browser, cloud, and TUI workflows.',
    icon: Code2,
    href: '/brokcode'
  },
  {
    title: 'BrokMail',
    body: 'Connected Gmail workflows for triage, drafting, and safe actions.',
    icon: Mail,
    href: '/brokmail'
  }
] as const

const GITHUB_URL = 'https://github.com/animvsh/broksearch-morphic'

export function BrokLanding({ isSignedIn }: BrokLandingProps) {
  const primaryHref = isSignedIn ? '/auth/access-pending' : '/auth/login'

  return (
    <main className="dashboard-shell playful-canvas relative isolate min-h-[calc(100vh-3.25rem)] overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[28rem] overflow-hidden"
      >
        <div className="absolute -top-32 right-[-10%] size-[36rem] rounded-full bg-[radial-gradient(circle_at_center,rgba(47,126,231,0.22),transparent_62%)] blur-2xl" />
        <div className="absolute -top-20 left-[-8%] size-[28rem] rounded-full bg-[radial-gradient(circle_at_center,rgba(26,99,199,0.18),transparent_60%)] blur-3xl" />
      </div>

      <section className="mx-auto flex w-full max-w-5xl flex-col items-center px-5 pt-20 pb-16 text-center sm:px-8 sm:pt-28">
        <div className="brand-halo brand-badge inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium text-zinc-700">
          <IconBlinkingLogo animate className="size-4" />
          <span>Brok</span>
        </div>

        <h1 className="brand-gradient-text brand-wordmark mt-8 text-5xl font-semibold tracking-tight sm:text-7xl">
          One workspace for AI search, code, and email.
        </h1>

        <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
          Chat with sources. Build with BrokCode. Triage email with BrokMail.
          All behind one login.
        </p>

        <div className="mt-10">
          <Button asChild size="lg" className="group h-12 px-7 text-base">
            <Link href={primaryHref}>
              Get started
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl px-5 pb-16 sm:px-8">
        <ul className="grid gap-4 md:grid-cols-3">
          {PRODUCTS.map(({ title, body, icon: Icon, href }) => (
            <li key={title}>
              <Link
                href={href}
                className="group dashboard-panel relative flex h-full flex-col gap-3 rounded-xl border border-border/60 bg-card/60 p-6 backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/25 hover:shadow-[0_24px_60px_-44px_rgba(23,23,23,0.22)]"
              >
                <ArrowUpRight className="absolute top-5 right-5 size-4 text-muted-foreground/60 transition-all group-hover:text-foreground group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                <span className="brand-mark inline-flex size-9 items-center justify-center rounded-lg">
                  <Icon className="size-4 text-zinc-700" />
                </span>
                <h2 className="text-base font-semibold tracking-tight">
                  {title}
                </h2>
                <p className="text-sm leading-6 text-muted-foreground">
                  {body}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto w-full max-w-5xl px-5 pb-20 sm:px-8">
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <Plug className="size-4" />
          <span>Also: the Brok API (OpenAI-compatible)</span>
          <span aria-hidden="true">·</span>
          <Link
            href="/docs/quickstart"
            className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
          >
            Read the quickstart
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-border/40">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-2 px-5 py-6 text-sm text-muted-foreground sm:flex-row sm:px-8">
          <span>© 2026 Brok</span>
          <nav className="flex items-center gap-5">
            <Link
              href="/docs"
              className="hover:text-foreground hover:underline"
            >
              Docs
            </Link>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground hover:underline"
            >
              GitHub
            </a>
          </nav>
        </div>
      </footer>
    </main>
  )
}
