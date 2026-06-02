import Link from 'next/link'

import {
  ArrowLeftRight,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  CircleHelp,
  GraduationCap,
  Rocket,
  Sparkles
} from 'lucide-react'

import { Button } from '@/components/ui/button'

const planPerks = [
  'Brok Search with cited AI answers and follow-ups',
  'BrokCode coding workspace with runtime + preview',
  'BrokMail triage, drafting, and approvals',
  'Reveal.js presentation builder and public share links',
  'OpenAI-compatible API platform and usage meters',
  'Classroom-ready export and documentation flow'
] as const

const planHighlights = [
  {
    icon: GraduationCap,
    title: 'For students',
    description:
      'Designed for coursework and project rhythm with predictable monthly cost.'
  },
  {
    icon: BookOpen,
    title: 'For classes',
    description:
      'Run research, code, mail, and deck workflows from one familiar workspace.'
  },
  {
    icon: Rocket,
    title: 'Fast execution',
    description:
      'Move from question to draft to shareable asset without context switching.'
  }
]

const faqs = [
  {
    title: 'Can I try before paying?',
    body: 'Yes, we support trialing flows through the platform and then upgrading to $7/mo.'
  },
  {
    title: 'Is there a single bill for all tools?',
    body: 'Yes. Search, coding, mail, presentations, and API access are included together.'
  },
  {
    title: 'Can I cancel quickly?',
    body: 'You can stop at the end of your cycle, and there is no tool-by-tool lock-in.'
  }
]

export const metadata = {
  title: 'Brok Pricing',
  description:
    'Brok is a single $7/month student plan for Search, BrokCode, BrokMail, presentations, and API tools.'
}

export default function PricingPage() {
  return (
    <main className="min-h-svh bg-[#f1f1f1] px-3 py-4 text-zinc-950 sm:px-5 sm:py-6 lg:px-8">
      <section className="mx-auto w-full max-w-7xl space-y-4">
        <div className="overflow-hidden rounded-xl border border-white/80 bg-white shadow-[0_46px_110px_-72px_rgba(24,24,27,0.82)]">
          <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                <Sparkles className="size-3.5" />
                University-ready pricing
              </p>

              <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
                One plan, all core AI tools. $7/mo.
              </h1>

              <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-600 sm:text-base">
                Brok combines research, coding, inbox workflows, presentation
                creation, and API access under one monthly plan. No separate
                feature pricing and no tool-by-tool extras.
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Button asChild className="h-11 rounded-md">
                  <Link href="/auth/login">
                    Start for $7/mo
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="h-11 rounded-md bg-white"
                >
                  <Link href="/features">Browse features</Link>
                </Button>
              </div>
            </div>

            <aside className="rounded-lg border border-zinc-200 bg-zinc-50 p-5 sm:p-6">
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                Student plan
              </p>
              <div className="mt-2 flex items-end gap-2">
                <span className="text-5xl font-semibold">$7</span>
                <span className="pb-1 text-sm text-zinc-500">/month</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-zinc-600">
                Unlimited core workflows for students and class projects.
              </p>

              <ul className="mt-5 space-y-2 text-sm text-zinc-700">
                {planPerks.map(perk => (
                  <li key={perk} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                    <span>{perk}</span>
                  </li>
                ))}
              </ul>
            </aside>
          </div>

          <div className="border-t border-zinc-100 px-6 pb-8 pt-4 sm:px-8">
            <div className="grid gap-4 sm:grid-cols-3">
              {planHighlights.map(item => {
                const Icon = item.icon
                return (
                  <article
                    key={item.title}
                    className="rounded-lg border border-zinc-200 bg-white p-4"
                  >
                    <div className="mb-3 inline-flex size-8 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50">
                      <Icon className="size-4" />
                    </div>
                    <h2 className="text-sm font-semibold">{item.title}</h2>
                    <p className="mt-2 text-sm leading-6 text-zinc-600">
                      {item.description}
                    </p>
                  </article>
                )
              })}
            </div>
          </div>
        </div>

        <section className="grid gap-4 rounded-lg border border-white/80 bg-white p-5 shadow-[0_18px_40px_-34px_rgba(24,24,27,0.45)] sm:p-6">
          <h2 className="text-xl font-semibold sm:text-2xl">FAQ</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {faqs.map(item => (
              <article
                key={item.title}
                className="rounded-md border border-zinc-200 bg-zinc-50 p-4"
              >
                <div className="mb-2 inline-flex items-center gap-2 text-sm font-semibold">
                  <CircleHelp className="size-4 text-zinc-500" />
                  {item.title}
                </div>
                <p className="text-sm leading-6 text-zinc-600">{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-[0_18px_40px_-34px_rgba(24,24,27,0.45)] sm:p-6">
          <h2 className="text-xl font-semibold sm:text-2xl">
            Use this plan for
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              'Whole class assignments',
              'Hackathons and demos',
              'AI-driven research projects'
            ].map(item => (
              <div
                key={item}
                className="rounded-md border border-zinc-200 p-4 text-sm text-zinc-600"
              >
                <div className="text-sm font-semibold text-zinc-900">
                  {item}
                </div>
                <p className="mt-2 leading-6">
                  Stay in one workspace from discovery to delivery.
                </p>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
            <Button asChild variant="outline" className="rounded-md bg-white">
              <Link href="/docs/quickstart">Read quickstart</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-md bg-white">
              <Link href="/features/presentations">
                Build a deck
                <ArrowLeftRight className="size-4" />
              </Link>
            </Button>
            <div className="text-zinc-500">
              Need team seats? Contact support for volume plans.
            </div>
          </div>
        </section>
      </section>
    </main>
  )
}
