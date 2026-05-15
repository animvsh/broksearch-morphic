import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { CheckCircle2, Link2, PlugZap, ShieldAlert } from 'lucide-react'

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

export const metadata: Metadata = {
  title: 'Integrations | Brok',
  description:
    'Connect Gmail, Google Workspace, GitHub, Linear, and other Composio integrations to Brok agents.'
}

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
    slug: 'googledocs',
    aliases: ['googledocs', 'google_docs', 'google-docs', 'docs'],
    name: 'Google Docs',
    description:
      'Create, read, and update Google Docs through connected Workspace workflows.',
    envKeys: [
      'COMPOSIO_GOOGLEDOCS_AUTH_CONFIG_ID',
      'COMPOSIO_GOOGLE_DOCS_AUTH_CONFIG_ID'
    ]
  },
  {
    slug: 'googlemeet',
    aliases: ['googlemeet', 'google_meet', 'google-meet', 'meet'],
    name: 'Google Meet',
    description:
      'Schedule, inspect, and coordinate Meet workflows from agent actions.',
    envKeys: [
      'COMPOSIO_GOOGLEMEET_AUTH_CONFIG_ID',
      'COMPOSIO_GOOGLE_MEET_AUTH_CONFIG_ID'
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

  const statCards = [
    {
      label: 'Connected',
      value: connected,
      icon: CheckCircle2,
      detail: 'Accounts ready for agent actions'
    },
    {
      label: 'Ready',
      value: ready,
      icon: PlugZap,
      detail: 'Auth configs waiting for approval'
    },
    {
      label: 'Needs config',
      value: unavailable,
      icon: ShieldAlert,
      detail: 'Toolkits missing Composio setup'
    }
  ]

  return (
    <div className="dashboard-shell min-h-full w-full p-3 sm:p-4">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3">
        <section className="morphic-surface rounded-2xl px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-border/70 bg-white/70 px-2.5 py-1 text-xs text-muted-foreground">
                <Link2 className="size-3.5" />
                {providerLabel}
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Integrations
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Connect the accounts Brok agents can read, draft against, and
                operate with approval.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3 lg:w-[520px]">
              {statCards.map(card => {
                const Icon = card.icon
                return (
                  <div
                    key={card.label}
                    className="rounded-xl border border-border/70 bg-white/70 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">
                        {card.label}
                      </span>
                      <Icon className="size-4 text-muted-foreground" />
                    </div>
                    <p className="mt-1 text-2xl font-semibold">{card.value}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {card.detail}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        <Card className="morphic-surface rounded-2xl border-border/70 shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Available Integrations</CardTitle>
            <CardDescription>
              Featured configured toolkits appear first, followed by every
              toolkit returned by Composio.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {!configured ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Add COMPOSIO_API_KEY for backend auth configs or
                COMPOSIO_CONNECT_KEY for Connect MCP mode, then reload this
                page.
              </div>
            ) : error ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
                {error}
              </div>
            ) : rows.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                No Composio integrations found yet.
              </div>
            ) : (
              <IntegrationRowsClient rows={rows} />
            )}
          </CardContent>
        </Card>

        <Card className="morphic-surface rounded-2xl border-border/70 shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Runtime Behavior</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground">
              {connectMode
                ? 'Connect mode opens provider approval in a popup and polls Composio until the account becomes active.'
                : 'Backend mode uses configured auth configs to create Composio connection links.'}{' '}
              Product tools still require their own approval-safe runtime before
              sending, deleting, or mutating external data.
            </p>
            <p className="mt-2 inline-flex items-center gap-2 text-xs text-muted-foreground">
              <Link2 className="size-3.5" />
              Agent access is exposed through the composioIntegrations tool.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
