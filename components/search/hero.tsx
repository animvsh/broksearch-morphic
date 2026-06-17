'use client'

import { useEffect, useRef, useState } from 'react'

import { ArrowUp, Paperclip, Sparkles, Square } from 'lucide-react'

import type { SearchMode } from '@/lib/types/search'
import { cn } from '@/lib/utils'
import { setCookie } from '@/lib/utils/cookies'

import {
  RecentSearches,
  recordRecentSearch
} from '@/components/search/recent-searches'

import { ExampleQueries } from './example-queries'
import { ModeDescription, ModeSelectorV2 } from './mode-selector-v2'

interface HeroProps {
  onSubmit: (query: string, mode: SearchMode, files: File[]) => void
  isSubmitting?: boolean
  onStop?: () => void
  pendingQuery?: string
  defaultMode?: SearchMode
  recentStorageKey?: string
  className?: string
  isCloudDeployment?: boolean
  hasModels?: boolean
}

export function Hero({
  onSubmit,
  isSubmitting = false,
  onStop,
  pendingQuery,
  defaultMode,
  recentStorageKey,
  className,
  isCloudDeployment: _isCloudDeployment,
  hasModels: _hasModels
}: HeroProps) {
  const [mode, setLocalMode] = useState<SearchMode>(defaultMode ?? 'quick')
  const [query, setQuery] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (defaultMode) setLocalMode(defaultMode)
  }, [defaultMode])

  useEffect(() => {
    setCookie('searchMode', mode)
  }, [mode])

  const submitQuery = (
    submittedQuery: string,
    submittedMode: SearchMode = mode,
    submittedFiles: File[] = files
  ) => {
    const trimmed = submittedQuery.trim()
    if (!trimmed || isSubmitting) return
    recordRecentSearch(trimmed, submittedMode, recentStorageKey)
    onSubmit(trimmed, submittedMode, submittedFiles)
    setQuery('')
  }

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault()
    submitQuery(query)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleFileSelect = (selected: FileList | null) => {
    if (!selected) return
    setFiles(prev => [...prev, ...Array.from(selected)])
  }

  const removeFile = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx))
  }

  const handleExampleSelect = (q: string, m?: SearchMode) => {
    const nextMode = m ?? mode
    if (m) setLocalMode(m)
    submitQuery(q, nextMode, [])
  }

  const handleRecentSelect = (q: string, storedMode?: string) => {
    const nextMode =
      storedMode === 'quick' ||
      storedMode === 'search' ||
      storedMode === 'deep' ||
      storedMode === 'code'
        ? storedMode
        : mode
    setLocalMode(nextMode)
    submitQuery(q, nextMode, [])
  }

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    const pastedFiles: File[] = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) pastedFiles.push(file)
      }
    }
    if (pastedFiles.length > 0) {
      e.preventDefault()
      setFiles(prev => [...prev, ...pastedFiles])
    }
  }

  return (
    <div
      className={cn(
        'mx-auto flex w-full max-w-3xl flex-col items-center px-4 py-6 sm:py-16',
        className
      )}
    >
      <div className="mb-5 flex flex-col items-center text-center sm:mb-8">
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur sm:mb-3">
          <Sparkles className="size-3 text-foreground/70" />
          Fast answers with sources
        </div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-4xl">
          Ask anything
        </h1>
        <p className="mt-1.5 max-w-md text-xs leading-relaxed text-muted-foreground sm:mt-2 sm:text-sm">
          Get a concise answer, cited sources, and useful follow-up questions.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="w-full"
        aria-label="Search query"
      >
        <div className="rounded-2xl border border-border/60 bg-card/70 shadow-sm backdrop-blur transition-all focus-within:border-foreground/20 focus-within:shadow-md">
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder='Ask anything, e.g. "What is the best way to learn React?"'
              rows={1}
              className={cn(
                'block w-full resize-none bg-transparent px-4 pt-4 pb-2 text-base leading-relaxed text-foreground placeholder:text-muted-foreground/70',
                'focus:outline-none',
                'min-h-[60px] max-h-[280px]'
              )}
              style={{
                height: 'auto',
                overflow: 'hidden'
              }}
              onInput={e => {
                const t = e.currentTarget
                t.style.height = 'auto'
                t.style.height = `${Math.min(t.scrollHeight, 280)}px`
              }}
              aria-label="Search query"
            />
          </div>

          {files.length > 0 && (
            <div className="flex flex-wrap gap-2 px-4 pb-2">
              {files.map((f, idx) => (
                <FileChip
                  key={`${f.name}-${idx}`}
                  file={f}
                  onRemove={() => removeFile(idx)}
                />
              ))}
            </div>
          )}

          <div className="flex flex-nowrap items-center justify-between gap-2 px-2 pb-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={e => {
                  handleFileSelect(e.target.files)
                  if (e.target) e.target.value = ''
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="clicky-control inline-flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Attach files"
              >
                <Paperclip className="size-4" />
              </button>
              <ModeSelectorV2
                value={mode}
                onChange={setLocalMode}
                size="sm"
                className="max-w-[calc(100vw-8rem)] shrink overflow-x-auto"
              />
            </div>

            <button
              type="submit"
              disabled={!isSubmitting && !query.trim()}
              className={cn(
                'clicky-control inline-flex h-11 min-h-11 min-w-11 items-center justify-center rounded-lg transition-all',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                query.trim() && !isSubmitting
                  ? 'bg-foreground text-background hover:bg-foreground/90'
                  : 'bg-foreground/5 text-muted-foreground/60 cursor-not-allowed',
                isSubmitting && 'bg-foreground/10 text-foreground'
              )}
              aria-label={isSubmitting ? 'Stop generating' : 'Send query'}
              onClick={e => {
                if (isSubmitting) {
                  e.preventDefault()
                  onStop?.()
                }
              }}
            >
              {isSubmitting ? (
                <Square className="size-3.5 fill-current" />
              ) : (
                <ArrowUp className="size-4" strokeWidth={2.5} />
              )}
            </button>
          </div>
        </div>
      </form>

      {isSubmitting && (
        <div
          role="status"
          aria-live="polite"
          data-testid="landing-submit-status"
          className="mt-3 w-full rounded-2xl border border-border/70 bg-card/80 p-3 text-sm shadow-sm backdrop-blur"
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-foreground text-background">
              <Sparkles className="size-3.5" />
            </span>
            <div className="min-w-0">
              <p className="font-medium text-foreground">
                Preparing your answer
              </p>
              {pendingQuery ? (
                <p className="truncate text-xs text-muted-foreground">
                  {pendingQuery}
                </p>
              ) : null}
            </div>
          </div>
          <div className="mt-3 grid gap-1.5 text-xs text-muted-foreground sm:grid-cols-3">
            {['Searching web', 'Reading sources', 'Writing answer'].map(
              (step, index) => (
                <span
                  key={step}
                  className="inline-flex items-center gap-1.5 rounded-full bg-foreground/[0.04] px-2.5 py-1"
                >
                  <span className="size-1.5 rounded-full bg-foreground/50" />
                  <span>{step}</span>
                  {index === 0 ? (
                    <span className="typing-dots ml-auto" aria-hidden>
                      <span />
                      <span />
                      <span />
                    </span>
                  ) : null}
                </span>
              )
            )}
          </div>
        </div>
      )}

      <div className="mt-2 w-full sm:mt-3">
        <ModeDescription mode={mode} />
      </div>

      <div className="mt-5 w-full space-y-4 sm:mt-8 sm:space-y-6">
        <RecentSearches
          onSelect={handleRecentSelect}
          storageKey={recentStorageKey}
        />
        <div className="space-y-2.5">
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <Sparkles className="size-3" />
            Try asking
          </div>
          <ExampleQueries onSelect={handleExampleSelect} count={6} />
        </div>
      </div>
    </div>
  )
}

function FileChip({ file, onRemove }: { file: File; onRemove: () => void }) {
  const sizeKb = Math.round(file.size / 1024)
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background py-1 pl-2.5 pr-1 text-xs">
      <Paperclip className="size-3 text-muted-foreground" />
      <span className="max-w-[160px] truncate text-foreground/80">
        {file.name}
      </span>
      <span className="text-muted-foreground/60">{sizeKb}KB</span>
      <button
        type="button"
        onClick={onRemove}
        className="ml-0.5 inline-flex size-11 min-h-11 min-w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
        aria-label={`Remove ${file.name}`}
      >
        ×
      </button>
    </span>
  )
}
