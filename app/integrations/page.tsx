import { redirect } from 'next/navigation'

import { Link2 } from 'lucide-react'

import { getCurrentUser } from '@/lib/auth/get-current-user'
import {
  isComposioConfigured,
  isComposioConnectMode,
  listAuthConfigs,
  listConnectedAccounts
} from '@/lib/integrations/composio'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'

import {
  IntegrationRow,
  IntegrationRowsClient
} from '@/components/integrations/integration-rows-client'

export const dynamic = 'force-dynamic'

function formatToolkitName(slug: string) {
  return slug
    .split(/[-_]/g)
    .filter(Boolean)
    .map(part => part[0]?.toUpperCase() + part.slice(1))
    .join(' ')
}

async function loadIntegrationRows(userId: string): Promise<{
  configured: boolean
  connectMode: boolean
  rows: IntegrationRow[]
  error: string | null
}> {
  const connectMode = isComposioConnectMode()

  if (!isComposioConfigured()) {
    return { configured: false, connectMode, rows: [], error: null }
  }

  try {
    const [authConfigs, connectedAccounts] = await Promise.all([
      listAuthConfigs(),
      listConnectedAccounts(userId, undefined, 200)
    ])

    const byToolkit = new Map<string, IntegrationRow>()

    for (const config of authConfigs) {
      const slug = config.toolkit_slug || 'unknown'
      const current = byToolkit.get(slug) ?? {
        slug,
        name: config.appName || formatToolkitName(slug),
        authConfigCount: 0,
        connectedCount: 0,
        status: 'unavailable' as const
      }
      current.authConfigCount += 1
      if (config.appName && current.name === formatToolkitName(slug)) {
        current.name = config.appName
      }
      byToolkit.set(slug, current)
    }

    for (const account of connectedAccounts) {
      const slug = account.toolkit_slug || account.toolkit || 'unknown'
      const current = byToolkit.get(slug) ?? {
        slug,
        name: account.appName || formatToolkitName(slug),
        authConfigCount: 0,
        connectedCount: 0,
        status: 'unavailable' as const
      }
      current.connectedCount += 1
      if (account.appName && current.name === formatToolkitName(slug)) {
        current.name = account.appName
      }
      byToolkit.set(slug, current)
    }

    const rows = [...byToolkit.values()]
      .map(row => {
        const status: IntegrationRow['status'] =
          row.connectedCount > 0
            ? 'connected'
            : row.authConfigCount > 0
              ? 'ready'
              : 'unavailable'

        return { ...row, status }
      })
      .sort((a, b) => a.name.localeCompare(b.name))

    return { configured: true, connectMode, rows, error: null }
  } catch (error) {
    return {
      configured: true,
      connectMode,
      rows: [],
      error: error instanceof Error ? error.message : 'Failed to load integrations'
    }
  }
}

export default async function IntegrationsPage() {
  const user = await getCurrentUser()
  if (!user) {
    redirect(`/auth/login?redirectTo=${encodeURIComponent('/integrations')}`)
  }

  const { configured, connectMode, rows, error } = await loadIntegrationRows(
    user.id
  )
  const connected = rows.filter(row => row.status === 'connected').length

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="border-b px-4 py-3">
        <h1 className="text-xl font-semibold">Integrations</h1>
        <p className="text-sm text-muted-foreground">
          Composio integration status for Brok
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Composio Overview</CardTitle>
              <CardDescription>
                Connected integrations: {connected} / {rows.length || 0}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {!configured ? (
                <p className="text-sm text-muted-foreground">
                  Set COMPOSIO_API_KEY or COMPOSIO_CONNECT_KEY to enable
                  integrations.
                </p>
              ) : error ? (
                <p className="text-sm text-rose-600 dark:text-rose-400">
                  {error}
                </p>
              ) : connectMode ? (
                <p className="text-sm text-muted-foreground">
                  Running in Composio Connect MCP mode.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Live integration inventory pulled from Composio.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Available Integrations</CardTitle>
              <CardDescription>
                Gmail, GitHub, Slack, Linear, and every configured toolkit for
                Brok.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {!configured ? (
                <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  Add COMPOSIO_API_KEY (backend) or COMPOSIO_CONNECT_KEY (MCP)
                  in your environment, then reload this page to list
                  integrations.
                </div>
              ) : rows.length === 0 ? (
                <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  No Composio integrations found yet.
                </div>
              ) : (
                <IntegrationRowsClient rows={rows} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">How Brok Uses This</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-sm text-muted-foreground">
                Brok agents can inspect connection status, create OAuth links,
                and execute tool workflows through Composio from chat and
                agent runs.
              </p>
              <p className="mt-2 inline-flex items-center gap-2 text-xs text-muted-foreground">
                <Link2 className="size-3.5" />
                Integration tooling is available via the composioIntegrations
                tool in agent mode.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
