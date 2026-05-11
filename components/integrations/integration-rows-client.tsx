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

      const popup = window.open(
        payload.connectionUrl,
        `brok-integration-connect-${toolkit}`,
        'popup=yes,width=560,height=760'
      )

      if (!popup) {
        window.location.href = payload.connectionUrl
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
          className="h-8 gap-2"
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
    <div className="space-y-3">
      <div className="hidden overflow-hidden rounded-md border md:block">
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="w-[34%] px-3 py-2 text-left font-medium">App</th>
              <th className="w-[18%] px-3 py-2 text-left font-medium">
                Toolkit
              </th>
              <th className="w-[14%] px-3 py-2 text-left font-medium">
                Configs
              </th>
              <th className="w-[14%] px-3 py-2 text-left font-medium">
                Accounts
              </th>
              <th className="w-[20%] px-3 py-2 text-left font-medium">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map(row => {
              const current = rowsBySlug.get(row.slug) || row

              return (
                <tr
                  key={row.slug}
                  className={cn(
                    'border-b align-top last:border-b-0',
                    current.featured ? 'bg-muted/20' : ''
                  )}
                >
                  <td className="px-3 py-3">{renderRowSummary(current)}</td>
                  <td className="px-3 py-3">
                    <span className="break-all font-mono text-xs text-muted-foreground">
                      {current.slug}
                    </span>
                  </td>
                  <td className="px-3 py-3">{current.authConfigCount}</td>
                  <td className="px-3 py-3">{current.connectedCount}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-col gap-3">
                      {renderStatus(current)}
                      {renderActions(current)}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 md:hidden">
        {tableRows.map(row => {
          const current = rowsBySlug.get(row.slug) || row

          return (
            <div
              key={current.slug}
              className={cn(
                'rounded-md border p-3',
                current.featured ? 'bg-muted/20' : ''
              )}
            >
              <div className="flex items-start justify-between gap-3">
                {renderRowSummary(current)}
                {renderStatus(current)}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md bg-muted/50 p-2">
                  <div className="text-muted-foreground">Toolkit</div>
                  <div className="mt-1 break-all font-mono">{current.slug}</div>
                </div>
                <div className="rounded-md bg-muted/50 p-2">
                  <div className="text-muted-foreground">Configs</div>
                  <div className="mt-1">{current.authConfigCount}</div>
                </div>
                <div className="rounded-md bg-muted/50 p-2">
                  <div className="text-muted-foreground">Accounts</div>
                  <div className="mt-1">{current.connectedCount}</div>
                </div>
              </div>
              <div className="mt-3">{renderActions(current)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
