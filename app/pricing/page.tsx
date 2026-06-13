import Link from 'next/link'

import {
  ArrowLeftRight,
  ArrowRight,
  BadgeDollarSign,
  BookOpen,
  CheckCircle2,
  CircleHelp,
  GraduationCap,
  Rocket,
  Sparkles
} from 'lucide-react'

import { Button } from '@/components/ui/button'

export const metadata = {
  title: 'Brok Pricing',
  description:
    'Brok is one $7/month student plan for search, BrokCode, BrokMail, presentations, and API tools.'
}

const planPerks = [
  'Brok Search with cited AI answers and follow-ups',
  'BrokCode coding workspace with runtime + preview',
  'BrokMail inbox triage, drafting, and approvals',
  'Reveal.js presentation builder and public share links',
  'OpenAI-compatible API platform and usage meters',
  'Team-wide access and project history'
] as const

const productHighlights = [
  {
    icon: BookOpen,
    title: 'Student-ready workflows',
    text: 'Use one plan from research to shipped assignment artifacts.'
  },
  {
    icon: GraduationCap,
    title: 'Built for class teams',
    text: 'Share context, review drafts, and move work from inbox to final deck quickly.'
  },
  {
    icon: Rocket,
    title: 'Ship everything in one place',
    text: 'Search, code, mail, presentations, and APIs are one coherent workflow.'
  },
  {
    icon: CircleHelp,
    title: 'No confusing add-ons',
    text: 'No per-feature upsells, no surprise tiers, clear monthly budgeting.'
  }
] as const

export default function PricingPage() {
  return (
    <main className="min-h-svh bg-[#dfdfdf] px-3 py-4 text-zinc-950 sm:px-5 sm:py-6 lg:px-8">
      <section className="mx-auto max-w-6xl space-y-4">
        <div className="overflow-hidden rounded-xl border border-white/80 bg-white shadow-[0_46px_110px_-72px_rgba(24,24,27,0.82)]">
          <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                <Sparkles className="size-3.5" />
                Built for student universes
              </p>

              <h1 className="mt-4 max-w-2xl text-[clamp(2rem,9vw,4rem)] font-semibold leading-tight tracking-tight lg:text-6xl">
                One plan. Five complete AI tools. $7/mo.
              </h1>

              <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-600 sm:text-base">
                Brok brings search, coding, email workflows, presentations, and
                API access into one student-first workspace. Start with every
                tool, scale usage with one budget.
              </p>

              <div className="mt-7 flex w-full flex-col gap-3 sm:flex-row">
                <Button asChild className="h-11 rounded-md">
                  <Link href="/auth/login">
                    Request invite
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="h-11 rounded-md bg-white sm:w-auto"
                >
                  <Link href="/features">Browse features</Link>
                </Button>
              </div>
            </div>

            <article className="rounded-lg border border-zinc-200 bg-zinc-50 p-5 sm:p-6">
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                Student plan
              </p>
              <div className="mt-2 flex items-end gap-2">
                <span className="text-4xl font-semibold sm:text-5xl">$7</span>
                <span className="pb-1 text-sm text-zinc-500">/month</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-zinc-600">
                Coverage includes every major feature for individual students
                and class projects.
              </p>

              <ul className="mt-5 space-y-2 text-sm text-zinc-700">
                {planPerks.map(perk => (
                  <li key={perk} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 size-4 text-emerald-600" />
                    <span>{perk}</span>
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {productHighlights.map(item => {
            const Icon = item.icon
            return (
              <article
                key={item.title}
                className="rounded-lg border border-zinc-200 bg-white p-4 shadow-[0_18px_40px_-34px_rgba(24,24,27,0.45)]"
              >
                <div className="mb-3 inline-flex size-8 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50">
                  <Icon className="size-4" />
                </div>
                <h2 className="text-sm font-semibold">{item.title}</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-600">
                  {item.text}
                </p>
              </article>
            )
          })}
        </div>

        <section className="grid gap-4 rounded-xl border border-white/80 bg-white p-5 shadow-[0_18px_40px_-34px_rgba(24,24,27,0.45)] sm:p-6">
          <h2 className="text-xl font-semibold sm:text-2xl">Plan math</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-sm uppercase text-zinc-500">Monthly budget</p>
              <p className="mt-2 flex items-center gap-2 text-2xl font-semibold">
                <BadgeDollarSign className="size-4 text-zinc-700" />
                One workspace, one card
              </p>
              <p className="mt-2 text-sm text-zinc-600">
                No per-feature top-ups or hidden compute tiers in this plan.
              </p>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-sm uppercase text-zinc-500">Best for</p>
              <p className="mt-2 flex items-center gap-2 text-2xl font-semibold">
                <ArrowLeftRight className="size-4 text-zinc-700" />
                Entire classes
              </p>
              <p className="mt-2 text-sm text-zinc-600">
                Move teams from research to presentations and prototype APIs
                without switching tools.
              </p>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-sm uppercase text-zinc-500">Upgrade path</p>
              <p className="mt-2 text-2xl font-semibold">
                Ask support if needed
              </p>
              <p className="mt-2 text-sm text-zinc-600">
                Keep this plan for class teams, then request bigger quotas only
                when growth requires it.
              </p>
            </div>
          </div>
        </section>
      </section>
    </main>
  )
}
