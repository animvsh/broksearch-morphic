'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { Search, X } from 'lucide-react'

import type {
  AdminSearchResult,
  AdminSearchResultType
} from '@/lib/actions/admin-search'
import { searchAdmin } from '@/lib/actions/admin-search'

import { Badge } from '@/components/ui/badge'

const TYPE_LABELS: Record<AdminSearchResultType, string> = {
  user: 'User',
  workspace: 'Workspace',
  api_key: 'API key',
  project: 'Project',
  presentation: 'Presentation',
  usage_log: 'Usage log',
  error_log: 'Error log',
  model: 'Model',
  provider: 'Provider'
}

const TYPE_TONES: Record<AdminSearchResultType, string> = {
  user: 'bg-sky-100 text-sky-800',
  workspace: 'bg-violet-100 text-violet-800',
  api_key: 'bg-emerald-100 text-emerald-800',
  project: 'bg-amber-100 text-amber-800',
  presentation: 'bg-rose-100 text-rose-800',
  usage_log: 'bg-zinc-100 text-zinc-700',
  error_log: 'bg-red-100 text-red-800',
  model: 'bg-indigo-100 text-indigo-800',
  provider: 'bg-teal-100 text-teal-800'
}

export function UniversalAdminSearch({
  placeholder = 'Search users, projects, API keys, logs, models…'
}: {
  placeholder?: string
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<AdminSearchResult[]>([])
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (query.trim().length === 0) {
      setResults([])
      setError(null)
      return
    }

    const handle = setTimeout(() => {
      startTransition(async () => {
        try {
          const response = await searchAdmin(query)
          setResults(response.results)
          setError(null)
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Search failed')
        }
      })
    }, 200)

    return () => clearTimeout(handle)
  }, [query])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        event.preventDefault()
        inputRef.current?.focus()
      }

      if (event.key === 'Escape') {
        setOpen(false)
        inputRef.current?.blur()
      }
    }

    function onClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onClickOutside)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onClickOutside)
    }
  }, [])

  function navigate(result: AdminSearchResult) {
    setOpen(false)
    setQuery('')
    setResults([])
    router.push(result.href)
  }

  function clear() {
    setQuery('')
    setResults([])
    setError(null)
    inputRef.current?.focus()
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-xl">
      <div className="relative flex items-center">
        <Search className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
        <input
          ref={inputRef}
          value={query}
          onChange={event => {
            setQuery(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          aria-label="Universal admin search"
          className="h-10 w-full rounded-md border bg-background pl-9 pr-20 text-sm shadow-sm outline-none ring-0 transition focus:border-foreground/40"
        />
        <div className="absolute right-2 flex items-center gap-1 text-xs text-muted-foreground">
          {query.length > 0 ? (
            <button
              type="button"
              onClick={clear}
              className="inline-flex size-6 items-center justify-center rounded-md border bg-background hover:bg-muted"
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          ) : (
            <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] sm:inline-flex">
              /
            </kbd>
          )}
        </div>
      </div>

      {open && query.trim().length > 0 ? (
        <div className="absolute left-0 right-0 z-50 mt-2 max-h-[420px] overflow-y-auto rounded-lg border bg-popover p-2 shadow-lg">
          {error ? (
            <p className="px-3 py-4 text-sm text-destructive">{error}</p>
          ) : isPending && results.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">
              Searching…
            </p>
          ) : results.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">
              No matches for{' '}
              <span className="font-medium text-foreground">{query}</span>
            </p>
          ) : (
            <ul className="space-y-1">
              {results.map(result => {
                const tone = TYPE_TONES[result.type]
                return (
                  <li key={`${result.type}-${result.title}-${result.subtitle}`}>
                    <button
                      type="button"
                      onClick={() => navigate(result)}
                      className="flex w-full items-start gap-3 rounded-md px-3 py-2 text-left transition hover:bg-muted"
                    >
                      <span
                        className={`mt-0.5 inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone}`}
                      >
                        {TYPE_LABELS[result.type]}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {result.title}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {result.subtitle}
                        </span>
                      </span>
                      {result.badge ? (
                        <Badge variant="outline">{result.badge}</Badge>
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
