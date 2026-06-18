'use client'

import { useEffect, useRef, useState } from 'react'

import { ArrowUp, Paperclip, Sparkles, Square } from 'lucide-react'

import type { ModelSelectorData } from '@/lib/types/model-selector'
import type { SearchMode } from '@/lib/types/search'
import { cn } from '@/lib/utils'
import { setCookie } from '@/lib/utils/cookies'

import { ModelSelectorClient } from '@/components/model-selector-client'
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
  defaultMode?: SearchMode
  attachmentsEnabled?: boolean
  recentStorageKey?: string
  className?: string
  isCloudDeployment?: boolean
  hasModels?: boolean
  modelSelectorData?: ModelSelectorData | null
}

export function Hero({
  onSubmit,
  isSubmitting = false,
  onStop,
  defaultMode,
  attachmentsEnabled = true,
  recentStorageKey,
  className,
  isCloudDeployment: _isCloudDeployment,
  hasModels: _hasModels,
  modelSelectorData
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

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 280)}px`
    textarea.style.overflowY = textarea.scrollHeight > 280 ? 'auto' : 'hidden'
  }, [query])

  const submitQuery = (
    submittedQuery: string,
    submittedMode: SearchMode = mode,
    submittedFiles: File[] = files
  ) => {
    const trimmed = submittedQuery.trim()
    if (!trimmed || isSubmitting) return
    recordRecentSearch(trimmed, submittedMode, recentStorageKey)
    onSubmit(trimmed, submittedMode, attachmentsEnabled ? submittedFiles : [])
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
    if (!attachmentsEnabled) return
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

  const handleRecentSelect = (q: string, storedMode?: SearchMode) => {
    const nextMode = storedMode ?? mode
    setLocalMode(nextMode)
    submitQuery(q, nextMode, [])
  }

  const handlePaste = async (e: React.ClipboardEvent) => {
    if (!attachmentsEnabled) return
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
        'mx-auto flex w-full max-w-3xl flex-col items-center px-4 py-10 sm:py-16',
        className
      )}
    >
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur">
          <Sparkles className="size-3 text-foreground/70" />
          Fast answers with sources
        </div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Ask anything
        </h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Get a concise answer, cited sources, and useful follow-up questions.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="w-full"
        aria-label="Ask Brok Search"
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
                t.style.overflowY = t.scrollHeight > 280 ? 'auto' : 'hidden'
              }}
              aria-label="Search query"
            />
          </div>

          {attachmentsEnabled && files.length > 0 && (
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

          <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              {attachmentsEnabled && (
                <>
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
                </>
              )}
              <ModeSelectorV2 value={mode} onChange={setLocalMode} size="sm" />
              <div className="min-w-0 max-w-full">
                {modelSelectorData ? (
                  <ModelSelectorClient data={modelSelectorData} compact />
                ) : null}
              </div>
            </div>

            <button
              type="submit"
              disabled={!query.trim() && !isSubmitting}
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

      <div className="mt-3 w-full">
        <ModeDescription mode={mode} />
      </div>

      <div className="mt-8 w-full space-y-6">
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
