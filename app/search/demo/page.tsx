'use client'

import { useState } from 'react'

import {
  DEMO_ANSWER,
  DEMO_FOLLOW_UPS,
  DEMO_SOURCES,
  type FollowUp,
  SearchAnswer
} from '@/components/search'

const QUERIES: Array<{
  q: string
  answer: string
}> = [
  {
    q: 'What are the latest advances in fusion energy as of 2026?',
    answer: DEMO_ANSWER
  },
  {
    q: 'How does React Server Components actually work under the hood?',
    answer: `React Server Components (RSC) flip the default execution model. Instead of sending a JS bundle for every component to the browser and hydrating, the server renders server components into a special wire format (the "RSC payload") and streams it to the client [1].

The key insight: server components run on the server, never re-render in the browser, and can directly await data (no useEffect waterfalls) [2]. The wire format interleaves server-rendered HTML, client component placeholders (with serialized props), and references between them, which the client uses to compose the final tree [1].

A "use client" boundary tells the bundler: "everything below this is a client component, ship JS for it." Above that boundary, code stays on the server — you can import a database client, read files, or call internal APIs without exposing them in the bundle [3].

The mental model: server components are the *output*, client components are the *interactivity*. Next.js App Router uses this for layouts, page components, and data fetching, while leaf components handling state or effects stay client-side [2].`
  }
]

export default function SearchDemoPage() {
  const [idx, setIdx] = useState(0)
  const [streaming, setStreaming] = useState(false)
  const [showFinal, setShowFinal] = useState(true)
  const current = QUERIES[idx]

  const handleFollowUp = (fu: FollowUp) => {
    console.log('follow up selected', fu)
  }

  const startStreaming = () => {
    setStreaming(true)
    setShowFinal(false)
    setTimeout(() => {
      setStreaming(false)
      setShowFinal(true)
    }, 6500)
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:py-16">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/40 p-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-violet-700">
            Demo
          </span>
          <span className="text-muted-foreground">
            Live preview of the new answer surface
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={idx}
            onChange={e => {
              setIdx(Number(e.target.value))
              setStreaming(false)
              setShowFinal(true)
            }}
            className="h-8 rounded-md border border-border/60 bg-background px-2 text-xs text-foreground"
          >
            {QUERIES.map((q, i) => (
              <option key={q.q} value={i}>
                {q.q.slice(0, 60)}
                {q.q.length > 60 ? '…' : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={startStreaming}
            disabled={streaming}
            className="h-8 rounded-md bg-foreground px-3 text-xs font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-50"
          >
            {streaming ? 'Streaming…' : 'Replay streaming'}
          </button>
        </div>
      </div>

      <SearchAnswer
        key={`${idx}-${streaming}-${showFinal}`}
        query={current.q}
        answer={current.answer}
        sources={DEMO_SOURCES}
        followUps={DEMO_FOLLOW_UPS}
        isStreaming={streaming}
        onFollowUpSelect={handleFollowUp}
        onRegenerate={() => alert('Regenerate clicked')}
        onShare={() => alert('Share clicked')}
        onReadAloud={() => alert('Read aloud clicked')}
        onTranslate={lang => alert(`Translate to ${lang}`)}
      />
    </main>
  )
}
