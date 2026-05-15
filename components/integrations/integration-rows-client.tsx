'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  PlugZap,
  RefreshCw,
  ShieldAlert
} from 'lucide-react'
import { toast } from 'sonner'

import { openComposioPopup } from '@/lib/composio-popup'
import { cn } from '@/lib/utils'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export type IntegrationRow = {
  slug: string
  name: string
  description?: string
  featured?: boolean
  authConfigCount: number
  connectedCount: number
  status: 'connected' | 'ready' | 'unavailable'
}

type StatusPayload = {
  configured?: boolean
  connected?: boolean
  status?: IntegrationRow['status']
  toolkit?: string
  connectedCount?: number
  authConfigCount?: number
  message?: string
}

const STATUS_META = {
  connected: {
    label: 'Connected',
    detail: 'Active account available',
    icon: CheckCircle2,
    badgeVariant: 'default' as const,
    className: 'text-emerald-700 dark:text-emerald-400'
  },
  ready: {
    label: 'Ready',
    detail: 'Auth config found',
    icon: PlugZap,
    badgeVariant: 'secondary' as const,
    className: 'text-blue-700 dark:text-blue-400'
  },
  unavailable: {
    label: 'Needs config',
    detail: 'No auth config found',
    icon: ShieldAlert,
    badgeVariant: 'outline' as const,
    className: 'text-muted-foreground'
  }
}

function delay(ms: number) {
  return new Promise(resolve => window.setTimeout(resolve, ms))
}

function formatToolkitName(slug: string) {
  return slug
    .split(/[-_]/g)
    .filter(Boolean)
    .map(part => part[0]?.toUpperCase() + part.slice(1))
    .join(' ')
}

function messageFromPayload(payload: unknown, fallback: string) {
  if (payload && typeof payload === 'object') {
    const message = (payload as Record<string, unknown>).message
    if (typeof message === 'string' && message.trim()) {
      return message
    }
  }

  return fallback
}

async function fetchToolkitStatus(toolkit: string) {
  const response = await fetch(
    `/api/integrations/${encodeURIComponent(toolkit)}/status`,
    { cache: 'no-store' }
  )
  const payload = (await response
    .json()
    .catch(() => null)) as StatusPayload | null

  if (!response.ok) {
    throw new Error(
      messageFromPayload(
        payload,
        `Could not check ${formatToolkitName(toolkit)} status.`
      )
    )
  }

  return payload
}

async function pollToolkitStatus(toolkit: string, popup: Window | null) {
  const startedAt = Date.now()
  let popupClosedAt: number | null = null
  let lastPayload: StatusPayload | null = null

  while (Date.now() - startedAt < 120_000) {
    try {
      const payload = await fetchToolkitStatus(toolkit)
      lastPayload = payload
      if (payload?.connected) {
        return payload
      }
    } catch (error) {
      lastPayload = {
        connected: false,
        status: 'unavailable',
        message:
          error instanceof Error
            ? error.message
            : `Could not check ${formatToolkitName(toolkit)} status.`
      }
    }

    if (popup?.closed && popupClosedAt === null) {
      popupClosedAt = Date.now()
    }

    if (popupClosedAt !== null && Date.now() - popupClosedAt > 12_000) {
      return lastPayload
    }

    await delay(popupClosedAt === null ? 1500 : 1000)
  }

  return lastPayload
}

type IntegrationRowsClientProps = {
  rows: IntegrationRow[]
}

export function IntegrationRowsClient({ rows }: IntegrationRowsClientProps) {
  const [tableRows, setTableRows] = useState(rows)
  const [connectingToolkit, setConnectingToolkit] = useState<string | null>(
    null
  )
  const [checkingToolkit, setCheckingToolkit] = useState<string | null>(null)
  const [rowMessages, setRowMessages] = useState<Record<string, string>>({})

  const rowsBySlug = useMemo(
    () => new Map(tableRows.map(row => [row.slug, row])),
    [tableRows]
  )

  const updateRowFromStatus = useCallback(
    (toolkit: string, payload: StatusPayload | null) => {
      if (!payload) return

      setTableRows(current =>
        current.map(row => {
          const payloadToolkit = payload.toolkit || toolkit
          if (row.slug !== toolkit && row.slug !== payloadToolkit) return row

          return {
            ...row,
            authConfigCount: Math.max(
              row.authConfigCount,
              payload.authConfigCount || 0
            ),
            connectedCount: Math.max(
              row.connectedCount,
              payload.connectedCount || (payload.connected ? 1 : 0)
            ),
            status:
              payload.status ||
              (payload.connected
                ? 'connected'
                : row.authConfigCount > 0
                  ? 'ready'
                  : row.status)
          }
        })
      )

      if (payload.message) {
        setRowMessages(current => ({
          ...current,
          [toolkit]: payload.message || ''
        }))
      }
    },
    []
  )

  const refreshToolkitStatus = useCallback(
    async (toolkit: string, options?: { quiet?: boolean }) => {
      setCheckingToolkit(toolkit)

      try {
        const payload = await fetchToolkitStatus(toolkit)
        updateRowFromStatus(toolkit, payload)

        if (!options?.quiet) {
          const message =
            payload?.message ||
            `${formatToolkitName(toolkit)} is ${
              payload?.connected ? 'connected' : 'not connected yet'
            }.`

          if (payload?.connected) {
            toast.success(message)
          } else {
            toast.info(message)
          }
        }

        return payload
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : `Could not refresh ${formatToolkitName(toolkit)}.`
        setRowMessages(current => ({ ...current, [toolkit]: message }))
        if (!options?.quiet) toast.error(message)
        return null
      } finally {
        setCheckingToolkit(null)
      }
    },
    [updateRowFromStatus]
  )

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const toolkit = params.get('integration')
    const connectionState = params.get('connection')

    if (!toolkit || connectionState !== 'callback') return

    const normalizedToolkit = toolkit.trim().toLowerCase()
    setRowMessages(current => ({
      ...current,
      [normalizedToolkit]:
        'Returned from provider approval. Confirming the Composio connection...'
    }))
    void refreshToolkitStatus(normalizedToolkit, { quiet: true }).then(
      payload => {
        if (payload?.connected) {
          toast.success(`${formatToolkitName(normalizedToolkit)} connected`)
        } else {
          toast.info(
            `${formatToolkitName(
              normalizedToolkit
            )} returned from provider approval. Status is still being confirmed.`
          )
        }
      }
    )

    window.history.replaceState(null, '', window.location.pathname)
  }, [refreshToolkitStatus])

  async function connectToolkit(toolkit: string) {
    const name = rowsBySlug.get(toolkit)?.name || formatToolkitName(toolkit)
    setConnectingToolkit(toolkit)
    setRowMessages(current => ({
      ...current,
      [toolkit]: 'Creating a Composio connection link...'
    }))

    try {
      const redirectUrl = `${window.location.origin}/integrations?integration=${encodeURIComponent(
        toolkit
      )}&connection=callback`
      const response = await fetch(
        `/api/integrations/${encodeURIComponent(toolkit)}/connect`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ redirectUrl })
        }
      )
      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(
          messageFromPayload(payload, `Could not start ${name} connection.`)
        )
      }

      if (
        typeof payload?.connectionUrl !== 'string' ||
        !payload.connectionUrl
      ) {
        throw new Error(
          messageFromPayload(
            payload,
            `Composio did not return a connection link for ${name}.`
          )
        )
      }

      const popup = openComposioPopup(
        payload.connectionUrl,
        `brok-integration-connect-${toolkit}`
      )

      if (!popup) {
        const message =
          'Popup blocked. Allow popups for Brok, then click Connect again.'
        setRowMessages(current => ({ ...current, [toolkit]: message }))
        toast.error(message)
        return
      }

      setRowMessages(current => ({
        ...current,
        [toolkit]:
          'Waiting for provider approval. This page will update when Composio confirms the account.'
      }))
      toast.info(`Complete ${name} authorization in the popup`)
      const status = await pollToolkitStatus(toolkit, popup)

      if (!popup.closed) {
        popup.close()
      }

      updateRowFromStatus(toolkit, status)

      if (status?.connected) {
        setRowMessages(current => ({
          ...current,
          [toolkit]: status.message || `${name} is connected through Composio.`
        }))
        toast.success(`${name} connected`)
        return
      }

      const message =
        status?.message ||
        `${name} authorization was not confirmed yet. If approval finished in the popup, refresh status in a moment.`
      setRowMessages(current => ({ ...current, [toolkit]: message }))
      toast.error(message)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : `Could not connect ${name}.`
      setRowMessages(current => ({ ...current, [toolkit]: message }))
      toast.error(message)
    } finally {
      setConnectingToolkit(null)
    }
  }

  if (tableRows.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        No Composio integrations found yet.
      </div>
    )
  }

  function renderStatus(row: IntegrationRow) {
    const meta = STATUS_META[row.status]
    const Icon = meta.icon

    return (
      <div className="flex min-w-0 flex-col gap-1">
        <Badge variant={meta.badgeVariant} className="w-fit gap-1.5">
          <Icon className="size-3" />
          {meta.label}
        </Badge>
        <span className={cn('text-xs', meta.className)}>{meta.detail}</span>
      </div>
    )
  }

  function renderActions(row: IntegrationRow) {
    const isConnecting = connectingToolkit === row.slug
    const isChecking = checkingToolkit === row.slug
    const disabled = Boolean(connectingToolkit) || row.status === 'unavailable'

    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={row.status === 'connected' ? 'outline' : 'default'}
          size="sm"
          className={cn(
            'h-8 gap-2 rounded-lg transition-all duration-200',
            isConnecting && 'composio-connect-button'
          )}
          onClick={() => connectToolkit(row.slug)}
          disabled={disabled}
        >
          {isConnecting ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <ExternalLink className="size-3.5" />
          )}
          {row.status === 'connected' ? 'Reconnect' : 'Connect'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-2"
          onClick={() => void refreshToolkitStatus(row.slug)}
          disabled={Boolean(connectingToolkit) || isChecking}
        >
          {isChecking ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          Refresh
        </Button>
      </div>
    )
  }

  function renderRowSummary(row: IntegrationRow) {
    const message = rowMessages[row.slug]

    return (
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate font-medium">{row.name}</span>
          {row.featured ? (
            <Badge variant="outline" className="shrink-0">
              Featured
            </Badge>
          ) : null}
        </div>
        <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
          {row.description || `${formatToolkitName(row.slug)} toolkit`}
        </p>
        {message ? (
          <p className="mt-2 text-xs text-muted-foreground">{message}</p>
        ) : null}
      </div>
    )
  }

  return (
    <div className="divide-y divide-zinc-100 overflow-hidden rounded-2xl border border-zinc-200/70 bg-white/70">
      {tableRows.map(row => {
        const current = rowsBySlug.get(row.slug) || row

        return (
          <div
            key={current.slug}
            className={cn(
              'composio-connect-card flex flex-col gap-3 bg-white/76 p-3 transition-all duration-200 hover:bg-white sm:flex-row sm:items-center sm:justify-between sm:p-4',
              current.featured ? 'ring-1 ring-inset ring-primary/10' : '',
              connectingToolkit === current.slug && 'is-connecting'
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3 sm:hidden">
                {renderRowSummary(current)}
                {renderStatus(current)}
              </div>
              <div className="hidden sm:block">{renderRowSummary(current)}</div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500">
                <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 font-mono">
                  {current.slug}
                </span>
                <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5">
                  {current.authConfigCount} configs
                </span>
                <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5">
                  {current.connectedCount} accounts
                </span>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-3 sm:justify-end">
              <div className="hidden sm:block">{renderStatus(current)}</div>
              {renderActions(current)}
            </div>
          </div>
        )
      })}
    </div>
  )
}
