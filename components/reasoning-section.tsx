'use client'

import { useEffect, useState } from 'react'

import type { ReasoningPart } from '@ai-sdk/provider-utils'

import { cn } from '@/lib/utils'

import { useArtifact } from '@/components/artifact/artifact-context'

import { CollapsibleMessage } from './collapsible-message'
import { DefaultSkeleton } from './default-skeleton'
import { MarkdownMessage } from './message'
import ProcessHeader from './process-header'

interface ReasoningContent {
  reasoning: string
  isDone: boolean
}

export interface ReasoningSectionProps {
  content: ReasoningContent
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  showIcon?: boolean
  variant?: 'default' | 'minimal' | 'process' | 'process-sub'
  isSingle?: boolean // Whether this is a single item or part of a group
  isFirst?: boolean
  isLast?: boolean
}

export function ReasoningSection({
  content,
  isOpen,
  onOpenChange,
  showIcon = false,
  variant = 'default',
  isSingle = true,
  isFirst = false,
  isLast = false
}: ReasoningSectionProps) {
  const { open } = useArtifact()
  // Show a short preview when collapsed; switch to a generic label when expanded
  const HEADER_PREVIEW_CHARS = 120
  const SANITIZE_MARKDOWN_PREVIEW = true
  const [preview, setPreview] = useState<string | null>(null)

  const toPreview = (text: string) => {
    const firstLine = (text || '').split(/\r?\n/)[0] || ''
    if (!SANITIZE_MARKDOWN_PREVIEW) return firstLine
    return firstLine
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1') // links [text](url)
      .replace(/`([^`]+)`/g, '$1') // inline code
      .replace(/\*\*([^*]+)\*\*/g, '$1') // bold **text**
      .replace(/__([^_]+)__/g, '$1') // bold __text__
      .replace(/^#{1,6}\s*/, '') // heading markers at start
  }

  // Lock a preview during streaming to avoid frequent churn; refresh once when done
  useEffect(() => {
    const text = content?.reasoning || ''
    if (!text) return
    const prepared = toPreview(text)
    if (!content.isDone) {
      // Set once during streaming
      if (!preview) setPreview(prepared.slice(0, HEADER_PREVIEW_CHARS))
    } else {
      // On completion, ensure preview reflects the final string (single update)
      const finalPreview = prepared.slice(0, HEADER_PREVIEW_CHARS)
      if (preview !== finalPreview) setPreview(finalPreview)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content.reasoning, content.isDone])

  const headerLabel = isOpen
    ? 'Analysis'
    : preview && preview.length > 0
      ? preview
      : !content.isDone
        ? 'Analyzing...'
        : 'Analysis'

  const reasoningHeader = (
    <ProcessHeader
      label={
        <div className="flex items-center gap-2 min-w-0">
          <div className="shrink-0 flex items-center justify-center">
            {content.isDone ? (
              <svg
                className="size-3.5 text-muted-foreground"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M8 1C4.13 1 1 4.13 1 8s3.13 7 7 7 7-3.13 7-7-3.13-7-7-7zm0 12.5c-3.04 0-5.5-2.46-5.5-5.5S4.96 2.5 8 2.5s5.5 2.46 5.5 5.5-2.46 5.5-5.5 5.5z"
                  fill="currentColor"
                  fillOpacity="0.3"
                />
                <path
                  d="M8 4c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 6.5c-1.38 0-2.5-1.12-2.5-2.5S6.62 5.5 8 5.5s2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
                  fill="currentColor"
                />
              </svg>
            ) : (
              <svg
                className="size-3.5 text-blue-500 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            )}
          </div>
          <span className="truncate block min-w-0 max-w-full">
            {headerLabel}
          </span>
        </div>
      }
      onInspect={() =>
        open({ type: 'reasoning', text: content.reasoning } as ReasoningPart)
      }
      isLoading={!content.isDone}
      ariaExpanded={isOpen}
    />
  )

  if (!content) return <DefaultSkeleton />

  // Return null if done and reasoning text is empty
  if (content.isDone && !content.reasoning?.trim()) return null

  return (
    <div className="relative" data-testid="reasoning-section">
      {/* Rails for header - show based on position */}
      {!isFirst && (
        <div className="absolute left-[19.5px] w-px bg-border h-2 top-0" />
      )}
      {!isLast && (
        <div className="absolute left-[19.5px] w-px bg-border h-2 bottom-0" />
      )}
      <CollapsibleMessage
        role="assistant"
        isCollapsible={true}
        header={reasoningHeader}
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        showBorder={isSingle}
        showIcon={showIcon}
        variant={variant}
        showSeparator={false}
        headerClickBehavior="split"
      >
        <div className="flex">
          {/* Rail space */}
          <div className="w-[16px] shrink-0 flex justify-center">
            <div
              className={cn(
                'w-px bg-border/50 transition-opacity duration-200',
                isOpen ? 'opacity-100' : 'opacity-0'
              )}
              style={{
                marginTop: isFirst ? '0' : '-1rem',
                marginBottom: isLast ? '0' : '-1rem'
              }}
            />
          </div>
          <div className="w-2 shrink-0" />
          <div className="[&_p]:text-xs [&_p]:text-muted-foreground/80 flex-1">
            <MarkdownMessage message={content.reasoning} />
          </div>
        </div>
      </CollapsibleMessage>
    </div>
  )
}
