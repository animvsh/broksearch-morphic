'use client'

import { Check, Link2, PlugZap, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'

import { openComposioPopup } from '@/lib/composio-popup'
import type { ToolPart } from '@/lib/types/ai'

import { Badge } from './ui/badge'
import { Button } from './ui/button'

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

  function openConnectionPopup() {
    if (!output?.connectionUrl) return

    const popup = openComposioPopup(
      output.connectionUrl,
      'brok-composio-tool-connect'
    )

    if (!popup) {
      toast.error('Popup blocked. Allow popups for Brok, then try again.')
      return
    }

    popup.focus()
  }

  return (
    <div className="composio-connect-card rounded-xl border border-border/70 bg-card/90 p-3">
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 h-8 gap-1.5 rounded-lg text-xs"
          onClick={openConnectionPopup}
        >
          <Link2 className="h-3.5 w-3.5" />
          Open connection popup
        </Button>
      )}
    </div>
  )
}
