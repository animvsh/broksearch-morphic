'use client'

import { useMemo, useState } from 'react'

import { Loader2, PlugZap } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export type IntegrationRow = {
  slug: string
  name: string
  authConfigCount: number
  connectedCount: number
  status: 'connected' | 'ready' | 'unavailable'
}

function delay(ms: number) {
  return new Promise(resolve => window.setTimeout(resolve, ms))
}

async function pollToolkitStatus(toolkit: string, popup: Window | null) {
  const statusUrl = `/api/integrations/${encodeURIComponent(toolkit)}/status`
  const startedAt = Date.now()

  while (Date.now() - startedAt < 120_000) {
    try {
      const response = await fetch(statusUrl)
      const payload = await response.json().catch(() => null)
      if (payload?.connected) {
        return payload
      }
    } catch {}

    if (popup?.closed) {
      try {
        const response = await fetch(statusUrl)
        const payload = await response.json().catch(() => null)
        return payload
      } catch {
        return null
      }
    }

    await delay(1500)
  }

  return null
}

type IntegrationRowsClientProps = {
  rows: IntegrationRow[]
}

export function IntegrationRowsClient({ rows }: IntegrationRowsClientProps) {
  const [tableRows, setTableRows] = useState(rows)
  const [connectingToolkit, setConnectingToolkit] = useState<string | null>(null)

  const rowsBySlug = useMemo(
    () => new Map(tableRows.map(row => [row.slug, row])),
    [tableRows]
  )

  async function connectToolkit(toolkit: string) {
    setConnectingToolkit(toolkit)
    try {
      const response = await fetch(
        `/api/integrations/${encodeURIComponent(toolkit)}/connect`,
        {
          method: 'POST'
        }
      )
      const payload = await response.json().catch(() => null)

      if (!payload?.connectionUrl) {
        throw new Error(
          payload?.message || `Could not create ${toolkit} connect link.`
        )
      }

      const popup = window.open(
        payload.connectionUrl,
        `brok-integration-connect-${toolkit}`,
        'popup=yes,width=560,height=760,noopener,noreferrer'
      )

      if (!popup) {
        window.location.href = payload.connectionUrl
        return
      }

      toast.info(`Complete ${toolkit} authorization in the popup`)
      const status = await pollToolkitStatus(toolkit, popup)

      if (!popup.closed) {
        popup.close()
      }

      if (status?.connected) {
        setTableRows(current =>
          current.map(row =>
            row.slug === toolkit
              ? {
                  ...row,
                  connectedCount: Math.max(
                    row.connectedCount,
                    status.connectedCount || 1
                  ),
                  status: 'connected'
                }
              : row
          )
        )
        toast.success(`${toolkit} connected`)
        return
      }

      throw new Error(
        status?.message || `Could not confirm ${toolkit} connection yet.`
      )
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `Could not connect ${toolkit}.`
      )
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

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40">
            <th className="px-3 py-2 text-left font-medium">App</th>
            <th className="px-3 py-2 text-left font-medium">Toolkit</th>
            <th className="px-3 py-2 text-left font-medium">Auth Configs</th>
            <th className="px-3 py-2 text-left font-medium">Connected Accounts</th>
            <th className="px-3 py-2 text-left font-medium">Status</th>
            <th className="px-3 py-2 text-left font-medium">Action</th>
          </tr>
        </thead>
        <tbody>
          {tableRows.map(row => {
            const isConnecting = connectingToolkit === row.slug
            const current = rowsBySlug.get(row.slug) || row

            return (
              <tr key={row.slug} className="border-b last:border-b-0">
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-2">
                    <PlugZap className="size-4 text-muted-foreground" />
                    {current.name}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                  {current.slug}
                </td>
                <td className="px-3 py-2">{current.authConfigCount}</td>
                <td className="px-3 py-2">{current.connectedCount}</td>
                <td className="px-3 py-2">
                  <Badge
                    variant={
                      current.status === 'connected'
                        ? 'default'
                        : current.status === 'ready'
                          ? 'secondary'
                          : 'outline'
                    }
                  >
                    {current.status}
                  </Badge>
                </td>
                <td className="px-3 py-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-2"
                    onClick={() => connectToolkit(current.slug)}
                    disabled={isConnecting}
                  >
                    {isConnecting ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : null}
                    {current.status === 'connected' ? 'Reconnect' : 'Connect'}
                  </Button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
