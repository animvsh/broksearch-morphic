import Link from 'next/link'

import { ArrowRight, CheckCircle2, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'

export const metadata = {
  title: 'Pricing',
  description:
    'Brok is a single $7/month student plan that bundles search, code, mail, presentations, and API tools.'
}

const planPerks = [
  'Brok Search with cited answers',
  'BrokCode builder workspace',
  'BrokMail email and calendar workflows',
  'Reveal.js presentation builder',
  'OpenAI-compatible API platform'
]

export default function PricingPage() {
  return (
    <main className="min-h-svh bg-[#d9d9d9] px-3 py-4 text-zinc-950 sm:px-5 sm:py-6 lg:px-8">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-4 rounded-lg border border-white/80 bg-white p-5 shadow-[0_46px_110px_-72px_rgba(24,24,27,0.82)] sm:p-8">
        <p className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
          <Sparkles className="size-3.5" />
          Built for student budgets
        </p>

        <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
          One plan. Five full AI workflows. $7/month.
        </h1>

        <p className="max-w-2xl text-sm leading-6 text-zinc-600 sm:text-base">
          Brok gives your team one workspace for research, coding help, email
          workflows, presentations, and APIs. No add-ons, no hidden tiers.
        </p>

        <div className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-lg border border-zinc-200 bg-white p-5">
            <div className="text-3xl font-semibold">
              $7<span className="ml-1 text-sm font-medium">/month</span>
            </div>
            <p className="mt-2 text-sm text-zinc-600">
              Enough for students, labs, and class-wide assignments.
            </p>
            <Button asChild className="mt-5 h-10 gap-2">
              <Link href="/auth/login">
                Start for $7/mo
                <ArrowRight className="size-4" />
              </Link>
            </Button>

            <ul className="mt-4 space-y-2 text-sm">
              {planPerks.map(perk => (
                <li key={perk} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 size-4 text-emerald-600" />
                  <span>{perk}</span>
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-lg border border-zinc-200 bg-zinc-50 p-5">
            <h2 className="text-lg font-semibold">Who this plan is for</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              Students and project teams that want a single place to move from
              assignment prompt to deployed artifact.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-zinc-600">
              <li>Research papers with source-backed claims.</li>
              <li>Build and iterate apps with file-aware coding sessions.</li>
              <li>Create, share, and present reveal.js decks.</li>
              <li>Use OpenAI-compatible APIs from one set of keys.</li>
            </ul>
            <div className="mt-5 text-sm text-zinc-600">
              API access includes model usage and production-ready endpoints for
              internal projects.
            </div>
          </article>
        </div>
      </section>
    </main>
  )
}
