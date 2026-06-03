'use client'

import { useState } from 'react'

import {
  ArrowDownToLine,
  ArrowLeftRight,
  ChevronsDownUp,
  ChevronsUpDown,
  FileText,
  Languages,
  Loader2
} from 'lucide-react'
import { toast } from 'sonner'

import { cn } from '@/lib/utils'
import { safeCopyTextToClipboard } from '@/lib/utils/copy-to-clipboard'

interface QuickActionsProps {
  text: string
  className?: string
  onTransform?: (mode: QuickActionMode, prompt: string) => Promise<string> | string
}

export type QuickActionMode =
  | 'summarize'
  | 'translate'
  | 'expand'
  | 'shorten'
  | 'export-md'
  | 'export-pdf'

interface QuickActionConfig {
  id: QuickActionMode
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  requiresTransform: boolean
}

const QUICK_ACTIONS: QuickActionConfig[] = [
  {
    id: 'summarize',
    label: 'Summarize',
    description: 'Condense the answer to key points',
    icon: ChevronsDownUp,
    requiresTransform: true
  },
  {
    id: 'translate',
    label: 'Translate',
    description: 'Translate to a target language',
    icon: Languages,
    requiresTransform: true
  },
  {
    id: 'expand',
    label: 'Expand',
    description: 'Add more detail and context',
    icon: ChevronsUpDown,
    requiresTransform: true
  },
  {
    id: 'shorten',
    label: 'Shorten',
    description: 'Make the answer more concise',
    icon: ArrowLeftRight,
    requiresTransform: true
  },
  {
    id: 'export-md',
    label: 'Markdown',
    description: 'Copy the answer as Markdown',
    icon: FileText,
    requiresTransform: false
  },
  {
    id: 'export-pdf',
    label: 'PDF',
    description: 'Print or save as PDF',
    icon: ArrowDownToLine,
    requiresTransform: false
  }
]

const PROMPTS: Record<QuickActionMode, string> = {
  summarize:
    'Summarize the following answer in 3-5 bullet points, preserving citations and source URLs:',
  translate:
    'Translate the following answer to Spanish. Preserve inline citations and source links:',
  expand:
    'Expand the following answer with more context, examples, and supporting detail while keeping citations intact:',
  shorten:
    'Shorten the following answer to a 2-3 sentence summary while keeping the most important citations:',
  'export-md': '',
  'export-pdf': ''
}

/**
 * Quick actions row (PRD section 18 — Brok Chat Interaction Features):
 * Summarize, Translate, Expand, Shorten, plus Markdown / PDF export. When a
 * transform mode is selected without a `onTransform` handler, the prompt
 * template is copied to the clipboard so the user can paste it into the
 * chat as a follow-up.
 */
export function QuickActions({ text, className, onTransform }: QuickActionsProps) {
  const [pendingMode, setPendingMode] = useState<QuickActionMode | null>(null)

  if (!text?.trim()) {
    return null
  }

  const handleClick = async (config: QuickActionConfig) => {
    setPendingMode(config.id)
    try {
      if (config.id === 'export-md') {
        const copied = await safeCopyTextToClipboard(text)
        if (copied) {
          toast.success('Answer copied as Markdown')
        } else {
          toast.error('Clipboard access was blocked')
        }
        return
      }
      if (config.id === 'export-pdf') {
        openPrintWindow(text)
        return
      }
      const prompt = `${PROMPTS[config.id]}\n\n${text}`
      if (onTransform) {
        await onTransform(config.id, prompt)
        return
      }
      const copied = await safeCopyTextToClipboard(prompt)
      if (copied) {
        toast.success(
          `${config.label} prompt copied. Paste it into the chat to run.`
        )
      } else {
        toast.error('Clipboard access was blocked')
      }
    } catch (error) {
      console.error('Quick action failed:', error)
      toast.error('Quick action could not be completed.')
    } finally {
      setPendingMode(null)
    }
  }

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-1.5 self-end',
        className
      )}
      data-testid="quick-actions"
    >
      {QUICK_ACTIONS.map(config => {
        const Icon = config.icon
        const isPending = pendingMode === config.id
        return (
          <button
            key={config.id}
            type="button"
            onClick={() => void handleClick(config)}
            disabled={pendingMode !== null}
            title={config.description}
            aria-label={config.label}
            data-testid={`quick-action-${config.id}`}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border border-zinc-200/80 bg-white/70 px-2.5 py-1 text-[11px] font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-white hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 disabled:cursor-not-allowed disabled:opacity-60'
            )}
          >
            {isPending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Icon className="size-3" />
            )}
            <span>{config.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function openPrintWindow(text: string) {
  if (typeof window === 'undefined') return
  const popup = window.open('', '_blank', 'width=720,height=900')
  if (!popup) {
    toast.error('Pop-up blocked. Allow pop-ups to export as PDF.')
    return
  }
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  popup.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Brok answer</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 32px; line-height: 1.5; color: #111; }
      pre, code { white-space: pre-wrap; word-wrap: break-word; }
    </style>
  </head>
  <body>
    <pre>${escaped}</pre>
    <script>
      window.addEventListener('load', function () {
        try { window.print(); } catch (e) { /* user cancelled */ }
      });
    </script>
  </body>
</html>`)
  popup.document.close()
}
