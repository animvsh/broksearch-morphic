'use client'

import { Check, Link2, PlugZap, TriangleAlert } from 'lucide-react'

import type { ToolPart } from '@/lib/types/ai'

import { Badge } from './ui/badge'

type ComposioOutput = {
  state?: string
  success?: boolean
  configured?: boolean
  action?: string
  message?: string
  connectedCount?: number
  connectionUrl?: string | null
}

export function ToolComposioDisplay({
  tool
}: {
  tool: ToolPart<'composioIntegrations'>
}) {
  const output =
    tool.state === 'output-available'
      ? (tool.output as ComposioOutput | undefined)
      : undefined

  const isWorking =
    tool.state === 'input-streaming' || tool.state === 'input-available'
  const isError = tool.state === 'output-error' || output?.success === false

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <PlugZap className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Composio Integrations</span>
        </div>
        <Badge variant={isError ? 'destructive' : 'secondary'}>
          {isWorking ? 'Checking' : isError ? 'Needs setup' : 'Ready'}
        </Badge>
      </div>

      <div className="text-xs text-muted-foreground">
        {isWorking ? (
          <span>Checking integration status…</span>
        ) : isError ? (
          <span className="inline-flex items-center gap-1 text-destructive">
            <TriangleAlert className="h-3.5 w-3.5" />
            {output?.message || tool.errorText || 'Composio request failed'}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <Check className="h-3.5 w-3.5" />
            {output?.message ||
              `Connected accounts: ${output?.connectedCount ?? 0}`}
          </span>
        )}
      </div>

      {output?.connectionUrl && (
        <a
          href={output.connectionUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
        >
          <Link2 className="h-3.5 w-3.5" />
          Open connection link
        </a>
      )}
    </div>
  )
}
