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

const FEATURED_TOOLKITS = [
  {
    slug: 'googlesuper',
    aliases: ['googlesuper', 'google_super'],
    name: 'Google Super',
    description:
      'One Google Workspace connection for mail, calendar, docs, and drive workflows.',
    envKeys: [
      'COMPOSIO_GOOGLESUPER_AUTH_CONFIG_ID',
      'COMPOSIO_GOOGLE_SUPER_AUTH_CONFIG_ID'
    ]
  },
  {
    slug: 'gmail',
    aliases: ['gmail'],
    name: 'Gmail',
    description:
      'Read, search, draft, and triage mailbox workflows through Composio.',
    envKeys: ['COMPOSIO_GMAIL_AUTH_CONFIG_ID']
  },
  {
    slug: 'googlecalendar',
    aliases: ['gcal', 'googlecalendar', 'google_calendar'],
    name: 'Google Calendar',
    description:
      'Inspect and manage calendar events with approval-aware agent actions.',
    envKeys: [
      'COMPOSIO_GCAL_AUTH_CONFIG_ID',
      'COMPOSIO_GOOGLECALENDAR_AUTH_CONFIG_ID',
      'COMPOSIO_GOOGLE_CALENDAR_AUTH_CONFIG_ID'
    ]
  },
  {
    slug: 'github',
    aliases: ['github'],
    name: 'GitHub',
    description:
      'Give Brok repo context for issue, PR, and code workflow automation.',
    envKeys: ['COMPOSIO_GITHUB_AUTH_CONFIG_ID']
  },
  {
    slug: 'linear',
    aliases: ['linear'],
    name: 'Linear',
    description:
      'Create, inspect, and update product work items from agent workflows.',
    envKeys: ['COMPOSIO_LINEAR_AUTH_CONFIG_ID']
  },
  {
    slug: 'supabase',
    aliases: ['supabase'],
    name: 'Supabase',
    description:
      'Connect database and project operations when a Supabase toolkit is configured.',
    envKeys: ['COMPOSIO_SUPABASE_AUTH_CONFIG_ID']
  }
] as const

function normalizeToolkitSlug(slug: string) {
  return slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
}

function findFeaturedToolkit(slug: string) {
  const normalized = normalizeToolkitSlug(slug)
  return FEATURED_TOOLKITS.find(toolkit =>
    toolkit.aliases.some(alias => normalizeToolkitSlug(alias) === normalized)
  )
}

function configuredToolkitSlugsFromEnv(connectMode: boolean) {
  const configured = new Set<string>()

  if (connectMode) {
    const toolkitList =
      process.env.COMPOSIO_CONNECT_TOOLKITS?.trim() ||
      process.env.COMPOSIO_TOOLKITS?.trim() ||
      ''

    for (const slug of toolkitList.split(',')) {
      const featured = findFeaturedToolkit(slug)
      if (featured) configured.add(featured.slug)
    }
  }

  for (const toolkit of FEATURED_TOOLKITS) {
    if (toolkit.envKeys.some(key => Boolean(process.env[key]?.trim()))) {
      configured.add(toolkit.slug)
    }
  }

  return configured
}

function applyToolkitMetadata(row: IntegrationRow): IntegrationRow {
  const featured = findFeaturedToolkit(row.slug)
  if (!featured) return row

  return {
    ...row,
    name: row.name === formatToolkitName(row.slug) ? featured.name : row.name,
    description: featured.description,
    featured: true
  }
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
        description: undefined,
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
        description: undefined,
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

    for (const slug of configuredToolkitSlugsFromEnv(connectMode)) {
      const featured = findFeaturedToolkit(slug)
      if (!featured) continue

      const hasExistingRow = [...byToolkit.keys()].some(key => {
        const existing = findFeaturedToolkit(key)
        return existing?.slug === slug
      })
      if (hasExistingRow) continue

      byToolkit.set(featured.slug, {
        slug: featured.slug,
        name: featured.name,
        description: featured.description,
        featured: true,
        authConfigCount: 1,
        connectedCount: 0,
        status: 'ready'
      })
    }

    const rows = [...byToolkit.values()]
      .map(row => {
        const status: IntegrationRow['status'] =
          row.connectedCount > 0
            ? 'connected'
            : row.authConfigCount > 0
              ? 'ready'
              : 'unavailable'

        return applyToolkitMetadata({ ...row, status })
      })
      .sort((a, b) => {
        const aFeaturedIndex = FEATURED_TOOLKITS.findIndex(
          toolkit => toolkit.slug === findFeaturedToolkit(a.slug)?.slug
        )
        const bFeaturedIndex = FEATURED_TOOLKITS.findIndex(
          toolkit => toolkit.slug === findFeaturedToolkit(b.slug)?.slug
        )
        const aFeaturedRank =
          aFeaturedIndex === -1 ? Number.MAX_SAFE_INTEGER : aFeaturedIndex
        const bFeaturedRank =
          bFeaturedIndex === -1 ? Number.MAX_SAFE_INTEGER : bFeaturedIndex
        if (aFeaturedRank !== bFeaturedRank) {
          return aFeaturedRank - bFeaturedRank
        }
        const statusRank = { connected: 0, ready: 1, unavailable: 2 }
        if (statusRank[a.status] !== statusRank[b.status]) {
          return statusRank[a.status] - statusRank[b.status]
        }
        return a.name.localeCompare(b.name)
      })

    return { configured: true, connectMode, rows, error: null }
  } catch (error) {
    return {
      configured: true,
      connectMode,
      rows: [],
      error:
        error instanceof Error ? error.message : 'Failed to load integrations'
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
  const ready = rows.filter(row => row.status === 'ready').length
  const unavailable = rows.filter(row => row.status === 'unavailable').length
  const providerLabel = connectMode ? 'Composio Connect MCP' : 'Composio API'

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="border-b px-4 py-3">
        <h1 className="text-xl font-semibold">Integrations</h1>
        <p className="text-sm text-muted-foreground">
          Live Composio connections available to Brok agents
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Composio Overview</CardTitle>
              <CardDescription>
                {providerLabel} - {connected} connected - {ready} ready
                {unavailable > 0 ? ` - ${unavailable} unavailable` : ''}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {!configured ? (
                <p className="text-sm text-muted-foreground">
                  Add COMPOSIO_API_KEY for backend auth configs or
                  COMPOSIO_CONNECT_KEY for Connect MCP mode, then reload this
                  page.
                </p>
              ) : error ? (
                <p className="text-sm text-rose-600 dark:text-rose-400">
                  {error}
                </p>
              ) : connectMode ? (
                <p className="text-sm text-muted-foreground">
                  Connect mode is enabled. The page opens provider approval in a
                  popup and polls Composio until the account becomes active.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Backend mode is enabled. Rows marked ready have an auth config
                  and can create a Composio connection link.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Available Integrations
              </CardTitle>
              <CardDescription>
                Featured configured toolkits appear first, followed by every
                toolkit returned by Composio.
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
                Brok agents can inspect connection status and create OAuth links
                through Composio from chat and agent runs. Product tools only
                execute actions after their own approval-safe runtime is
                connected.
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
