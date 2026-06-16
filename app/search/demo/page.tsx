'use client'

import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'

import { Loader2, Search, Sparkles } from 'lucide-react'

import {
  DEMO_ANSWER,
  DEMO_FOLLOW_UPS,
  DEMO_SOURCES,
  type FollowUp,
  SearchAnswer
} from '@/components/search'

type DemoScenario = {
  id: string
  query: string
  label: string
  answer: string
  followUps: FollowUp[]
}

const SCENARIOS: DemoScenario[] = [
  {
    id: 'fusion',
    label: 'Fusion progress',
    query: 'What are the latest advances in fusion energy as of 2026?',
    answer: DEMO_ANSWER,
    followUps: DEMO_FOLLOW_UPS
  },
  {
    id: 'rsc',
    label: 'React internals',
    query: 'How does React Server Components actually work under the hood?',
    answer: `React Server Components (RSC) flip the default execution model. Instead of shipping JavaScript for every component, the server renders server components into an RSC payload and streams that payload to the browser [1].

The practical win is that server components can await data directly, render close to private infrastructure, and avoid client-side fetching waterfalls [2]. Client components still own interactivity: state, effects, browser APIs, and event handlers stay below a "use client" boundary.

For a Next.js App Router app, the useful mental model is: server components prepare the answer, client components make it feel alive. The boundary is architectural, not visual. A page can mix both, with server-rendered layouts and client-side controls composing into one tree [3].`,
    followUps: [
      {
        id: 'rsc-1',
        query: 'Show a simple RSC data fetching example with a client boundary',
        kind: 'dive-deeper'
      },
      {
        id: 'rsc-2',
        query: 'Compare React Server Components with traditional SSR',
        kind: 'compare'
      },
      {
        id: 'rsc-3',
        query: 'What mistakes cause too much code to ship to the client?',
        kind: 'different-angle'
      },
      {
        id: 'rsc-4',
        query: 'How does the RSC payload relate to hydration?',
        kind: 'related'
      }
    ]
  },
  {
    id: 'ai-news',
    label: 'AI news brief',
    query: 'Summarize the latest AI news',
    answer: `This demo is static, so it should not be treated as a live news digest. A real Brok search would fetch current sources before answering. In this preview, the shape of the response is what matters: short synthesis first, sources visible nearby, and follow-ups ready for the next turn [1].

For fast research workflows, the MVP behavior should make three things obvious: what query was answered, which sources would support the answer, and what a user can ask next without losing context [2].

The strongest version of this surface is not a fake "live" feed. It is an honest preview that shows the interaction model while clearly labeling the data as canned demo content [3].`,
    followUps: [
      {
        id: 'ai-1',
        query: 'What would a live AI news search need to verify?',
        kind: 'dive-deeper'
      },
      {
        id: 'ai-2',
        query: 'Compare static demo answers with live retrieval demos',
        kind: 'compare'
      },
      {
        id: 'ai-3',
        query: 'How should a search MVP disclose stale demo content?',
        kind: 'different-angle'
      },
      {
        id: 'ai-4',
        query: 'What sources should be prioritized for AI news?',
        kind: 'related'
      }
    ]
  },
  {
    id: 'cursor-windsurf',
    label: 'Tool comparison',
    query: 'Compare Cursor vs Windsurf',
    answer: `Cursor and Windsurf both target AI-assisted software development, but the buying decision usually comes down to workflow fit rather than a single winner [1].

Cursor tends to feel strongest when a developer wants a familiar VS Code-like environment with fast inline edits, repo-aware chat, and a broad extension ecosystem. Windsurf emphasizes agentic flows and a more guided coding experience, which can be helpful when the task is less about single-file edits and more about moving through a larger change [2].

For a team evaluation, the right demo would test the same tasks in both: onboarding to an unfamiliar repo, making a small bug fix, running tests, and explaining the final diff. That keeps the comparison grounded in real work instead of feature checklists [3].`,
    followUps: [
      {
        id: 'tools-1',
        query: 'Design a fair benchmark for AI coding tools',
        kind: 'dive-deeper'
      },
      {
        id: 'tools-2',
        query: 'Compare Cursor, Windsurf, and Claude Code for repo edits',
        kind: 'compare'
      },
      {
        id: 'tools-3',
        query: 'Which coding assistant is best for junior developers?',
        kind: 'different-angle'
      },
      {
        id: 'tools-4',
        query: 'What risks matter when adopting AI coding tools at work?',
        kind: 'related'
      }
    ]
  }
]

const DEMO_DELAY_MS = 900

function findScenario(query: string) {
  const normalized = query.trim().toLowerCase()
  return (
    SCENARIOS.find(s => s.query.toLowerCase() === normalized) ??
    SCENARIOS.find(s => normalized.includes(s.id.replace('-', ' '))) ??
    null
  )
}

function buildFallbackScenario(query: string): DemoScenario {
  return {
    id: 'custom',
    label: 'Custom demo',
    query,
    answer: `This is a static demo response for "${query}". It does not call live search or claim fresh web results.

In the real product, Brok would retrieve sources, rank them, stream a grounded answer, and preserve the thread for follow-up questions [1]. This preview keeps that interaction model visible without pretending the canned sources were fetched for your exact query [2].

Try one of the suggested prompts to see a more complete prewritten answer, or use follow-ups to watch the demo state update like a Perplexity-style search session [3].`,
    followUps: [
      {
        id: 'custom-1',
        query: `What sources would Brok need for "${query}"?`,
        kind: 'dive-deeper'
      },
      {
        id: 'custom-2',
        query: `Compare quick and deep search modes for "${query}"`,
        kind: 'compare'
      },
      {
        id: 'custom-3',
        query: `Ask this from a different angle: ${query}`,
        kind: 'different-angle'
      },
      {
        id: 'custom-4',
        query: `Related questions to research after "${query}"`,
        kind: 'related'
      }
    ]
  }
}

export default function SearchDemoPage() {
  const [input, setInput] = useState(SCENARIOS[0].query)
  const [activeScenario, setActiveScenario] = useState<DemoScenario>(
    SCENARIOS[0]
  )
  const [streaming, setStreaming] = useState(false)
  const [status, setStatus] = useState(
    'Static demo content. No live web search is being performed.'
  )
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const promptButtons = useMemo(() => SCENARIOS.slice(0, 4), [])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const runDemoSearch = (query: string, message?: string) => {
    const trimmed = query.trim()
    if (!trimmed) {
      setStatus('Enter a query or choose a prompt to run the demo.')
      return
    }

    if (timerRef.current) clearTimeout(timerRef.current)

    const nextScenario = findScenario(trimmed) ?? buildFallbackScenario(trimmed)
    setInput(trimmed)
    setActiveScenario(nextScenario)
    setStreaming(true)
    setStatus(message ?? 'Preparing a static demo answer...')

    timerRef.current = setTimeout(() => {
      setStreaming(false)
      setStatus(
        'Demo answer loaded from static content. Sources are illustrative.'
      )
    }, DEMO_DELAY_MS)
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    runDemoSearch(input)
  }

  const handlePromptSelect = (scenario: DemoScenario) => {
    runDemoSearch(scenario.query, `Loading "${scenario.label}" demo...`)
  }

  const handleFollowUp = (followUp: FollowUp) => {
    runDemoSearch(followUp.query, 'Loading follow-up demo answer...')
  }

  const showActionStatus = (message: string) => {
    setStatus(message)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setStatus('Static demo content. No live web search is being performed.')
    }, 2200)
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-12">
      <section className="mb-6 space-y-4 rounded-2xl border border-border/60 bg-card/40 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-emerald-700">
                <Sparkles className="size-3" />
                Public demo
              </span>
              <span className="text-muted-foreground">No login required</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Ask Broksearch
            </h1>
          </div>
          <div
            aria-live="polite"
            className="min-h-8 rounded-full border border-border/60 bg-background px-3 py-1.5 text-xs text-muted-foreground"
          >
            {streaming && (
              <Loader2 className="mr-1.5 inline size-3 animate-spin" />
            )}
            {status}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <label htmlFor="demo-query" className="sr-only">
            Demo search query
          </label>
          <div className="flex gap-2 rounded-xl border border-border/70 bg-background p-2 shadow-sm focus-within:ring-2 focus-within:ring-ring">
            <Search className="mt-2 size-4 shrink-0 text-muted-foreground" />
            <textarea
              id="demo-query"
              value={input}
              onChange={event => setInput(event.target.value)}
              rows={2}
              className="min-h-12 flex-1 resize-none bg-transparent text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground"
              placeholder="Ask a question to preview the static search experience..."
            />
            <button
              type="submit"
              disabled={streaming}
              className="self-end rounded-lg bg-foreground px-3 py-2 text-xs font-medium text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {streaming ? 'Running' : 'Search'}
            </button>
          </div>
        </form>

        <div className="flex flex-wrap gap-2">
          {promptButtons.map(scenario => (
            <button
              key={scenario.id}
              type="button"
              onClick={() => handlePromptSelect(scenario)}
              className="rounded-full border border-border/60 bg-background px-3 py-1.5 text-xs text-foreground/85 transition-colors hover:border-foreground/20 hover:bg-foreground/5"
            >
              {scenario.label}
            </button>
          ))}
        </div>
      </section>

      <SearchAnswer
        key={`${activeScenario.id}-${activeScenario.query}-${streaming}`}
        query={activeScenario.query}
        answer={activeScenario.answer}
        sources={DEMO_SOURCES}
        followUps={activeScenario.followUps}
        isStreaming={streaming}
        onFollowUpSelect={handleFollowUp}
        onRegenerate={() =>
          runDemoSearch(activeScenario.query, 'Replaying static demo answer...')
        }
        onShare={() =>
          showActionStatus('Share is disabled in this public static demo.')
        }
        onReadAloud={() =>
          showActionStatus('Read aloud is available in the full search app.')
        }
        onTranslate={lang =>
          showActionStatus(
            `Translation to ${lang} is preview-only on this demo page.`
          )
        }
      />
    </main>
  )
}
