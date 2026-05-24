'use client'

import { useMemo, useState } from 'react'

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
  toolkitSlug?: string | null
  message?: string
  connectedCount?: number
  connectionUrl?: string | null
  approvalRequired?: boolean
  actionRun?: {
    id?: string
    status?: string
    approvalId?: string | null
    expiresAt?: string | null
  } | null
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
  const [connectionState, setConnectionState] = useState<
    'idle' | 'popup' | 'connected'
  >('idle')
  const toolkitSlug = useMemo(() => output?.toolkitSlug || null, [output])

  const isWorking =
    tool.state === 'input-streaming' || tool.state === 'input-available'
  const isError = tool.state === 'output-error' || output?.success === false
  const isConnected =
    connectionState === 'connected' || (output?.connectedCount ?? 0) > 0

  async function pollConnectionStatus(popup: Window | null) {
    if (!toolkitSlug) return

    const startedAt = Date.now()
    const timeoutMs = 120_000

    while (Date.now() - startedAt < timeoutMs) {
      await new Promise(resolve => setTimeout(resolve, 2000))

      try {
        const response = await fetch(
          `/api/integrations/${toolkitSlug}/status`,
          {
            cache: 'no-store'
          }
        )
        const status = (await response.json().catch(() => null)) as {
          connected?: boolean
          message?: string
        } | null

        if (response.ok && status?.connected) {
          setConnectionState('connected')
          toast.success(`${toolkitSlug} connected. You can continue in chat.`)
          return
        }
      } catch {}

      if (popup?.closed) break
    }

    setConnectionState('idle')
  }

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

    setConnectionState('popup')
    popup.focus()
    void pollConnectionStatus(popup)
  }

  return (
    <div className="composio-connect-card rounded-xl border border-border/70 bg-card/90 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <PlugZap className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Composio Integrations</span>
        </div>
        <Badge variant={isError ? 'destructive' : 'secondary'}>
          {isWorking
            ? 'Checking'
            : isError
              ? 'Needs setup'
              : isConnected
                ? 'Connected'
                : connectionState === 'popup'
                  ? 'Waiting'
                  : 'Ready'}
        </Badge>
      </div>

      <div className="text-xs text-muted-foreground">
        {isWorking ? (
          <span>Checking integration status…</span>
        ) : isConnected ? (
          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <Check className="h-3.5 w-3.5" />
            {toolkitSlug
              ? `${toolkitSlug} is connected. Ask Brok to continue the action.`
              : output?.message || 'Connected account is ready.'}
          </span>
        ) : isError ? (
          <span className="inline-flex items-center gap-1 text-destructive">
            <TriangleAlert className="h-3.5 w-3.5" />
            {output?.message || tool.errorText || 'Composio request failed'}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <Check className="h-3.5 w-3.5" />
            {connectionState === 'popup'
              ? 'Finish the provider popup. Brok will detect the connection here.'
              : output?.message ||
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

      {output?.approvalRequired && output.actionRun?.id && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          Prepared action run {output.actionRun.id}. Approve it before Brok
          executes this connected-app action.
        </div>
      )}
    </div>
  )
}
