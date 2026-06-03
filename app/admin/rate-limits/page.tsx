import Link from 'next/link'

import { getRateLimitOverviewForAdmin } from '@/lib/actions/admin-rate-limits'
import { requirePageAuth } from '@/lib/auth/require-page-auth'

import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'

export const dynamic = 'force-dynamic'

const ADMIN_NAV: Array<{ href: string; label: string }> = [
  { href: '/admin/models', label: 'Models' },
  { href: '/admin/providers', label: 'Providers' },
  { href: '/admin/rate-limits', label: 'Rate Limits' },
  { href: '/admin/abuse', label: 'Abuse' },
  { href: '/admin/health', label: 'Health' },
  { href: '/admin/costs', label: 'Costs' }
]

function formatInteger(value: number | null | undefined) {
  if (value === null || value === undefined) return '∞'
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return value.toLocaleString()
}

function formatPercent(numerator: number, denominator: number) {
  if (!denominator) return '0%'
  return `${((numerator / denominator) * 100).toFixed(1)}%`
}

function formatDateTime(value: Date) {
  return new Date(value).toLocaleString()
}

function formatCents(value: number | null) {
  if (value === null || value === undefined) return 'Custom'
  return `$${(value / 100).toFixed(2)}`
}

function apiAccessVariant(
  access: 'disabled' | 'test-only' | 'enabled'
): 'destructive' | 'secondary' | 'default' {
  if (access === 'enabled') return 'default'
  if (access === 'test-only') return 'secondary'
  return 'destructive'
}

export default async function AdminRateLimitsPage() {
  await requirePageAuth('/admin/rate-limits')
  const overview = await getRateLimitOverviewForAdmin()
  const { events, totals, planLimits, limitTypes, planUsage } = overview
  const checks = totals.checks
  const blocked = totals.blocked
  const allowed = checks - blocked

  return (
    <div className="space-y-6 px-4 pb-8 sm:px-6 lg:px-8">
      <nav className="flex flex-wrap gap-1 rounded-md border bg-muted/40 p-1 text-sm">
        {ADMIN_NAV.map(item => {
          const isActive = item.href === '/admin/rate-limits'
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                isActive
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
              }`}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Rate Limits Admin</h1>
          <p className="text-muted-foreground">
            Control usage by plan, user, workspace, feature, model, and API key.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
          <span>
            <span className="font-semibold text-foreground">
              {totals.workspaces}
            </span>{' '}
            workspaces
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <span className="font-semibold text-foreground">{totals.keys}</span>{' '}
            keys
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Recent checks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{checks.toLocaleString()}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Last 200 rate-limit decisions.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Allowed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-600">
              {allowed.toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatPercent(allowed, checks)} of checks
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Blocked
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">
              {blocked.toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatPercent(blocked, checks)} of checks
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Recent rate-limit events</CardTitle>
            <CardDescription>
              Latest blocked/allowed decisions from the limiter.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">Time</th>
                    <th className="px-3 py-2 text-left font-medium">
                      Workspace
                    </th>
                    <th className="px-3 py-2 text-left font-medium">API Key</th>
                    <th className="px-3 py-2 text-left font-medium">Type</th>
                    <th className="px-3 py-2 text-right font-medium">
                      Current
                    </th>
                    <th className="px-3 py-2 text-right font-medium">Limit</th>
                    <th className="px-3 py-2 text-left font-medium">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {events.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-3 py-6 text-center text-muted-foreground"
                      >
                        No rate-limit events yet
                      </td>
                    </tr>
                  ) : (
                    events.map(event => (
                      <tr key={event.id} className="border-b last:border-b-0">
                        <td className="px-3 py-2 text-muted-foreground">
                          {formatDateTime(event.createdAt)}
                        </td>
                        <td className="px-3 py-2">
                          <p className="font-medium">{event.workspaceName}</p>
                          <p className="text-xs text-muted-foreground">
                            plan: {event.plan}
                          </p>
                        </td>
                        <td className="px-3 py-2">
                          <p className="font-medium">{event.apiKeyName}</p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {event.keyPrefix ?? 'unknown'} · {event.environment}
                          </p>
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant="outline">{event.limitType}</Badge>
                        </td>
                        <td className="px-3 py-2 text-right">
                          {event.currentValue.toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {event.limitValue.toLocaleString()}
                        </td>
                        <td className="px-3 py-2">
                          <Badge
                            variant={
                              event.blocked ? 'destructive' : 'secondary'
                            }
                          >
                            {event.blocked ? 'blocked' : 'allowed'}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top blocked limit types</CardTitle>
            <CardDescription>
              Where the limiter is throttling traffic most often.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {totals.blockedByLimitType.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No blocked events in the recent window.
              </p>
            ) : (
              <div className="space-y-3">
                {totals.blockedByLimitType.map(item => {
                  const max = Math.max(
                    ...totals.blockedByLimitType.map(i => i.count),
                    1
                  )
                  const widthPct = Math.max((item.count / max) * 100, 4)
                  return (
                    <div key={item.limitType}>
                      <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                        <span className="font-medium">{item.limitType}</span>
                        <span className="text-muted-foreground">
                          {item.count.toLocaleString()} blocked
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-destructive"
                          style={{ width: `${widthPct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Plan usage today</CardTitle>
          <CardDescription>
            Workspace and key footprint per plan, plus blocked traffic.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Plan</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Workspaces
                  </th>
                  <th className="px-3 py-2 text-right font-medium">API Keys</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Requests Today
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Blocked Today
                  </th>
                </tr>
              </thead>
              <tbody>
                {planUsage.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-6 text-center text-muted-foreground"
                    >
                      No workspace activity yet
                    </td>
                  </tr>
                ) : (
                  planUsage.map(row => (
                    <tr key={row.plan} className="border-b last:border-b-0">
                      <td className="px-3 py-2 font-medium capitalize">
                        {row.plan}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {row.workspaces.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {row.apiKeys.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {row.requestsToday.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {row.blockedToday.toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Plan defaults</CardTitle>
          <CardDescription>
            Limits applied when a workspace or key is provisioned on the plan.
            Custom overrides live on each API key.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[1100px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Plan</th>
                  <th className="px-3 py-2 text-right font-medium">Req/day</th>
                  <th className="px-3 py-2 text-right font-medium">RPM</th>
                  <th className="px-3 py-2 text-right font-medium">Tok/day</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Tok/month
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    App gens/day
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Projects/user
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Decks/month
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Slides/month
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    AI images/month
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    PPTX exports/month
                  </th>
                  <th className="px-3 py-2 text-right font-medium">API/min</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Monthly budget
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Max output tokens
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Max repair attempts
                  </th>
                  <th className="px-3 py-2 text-left font-medium">
                    API access
                  </th>
                </tr>
              </thead>
              <tbody>
                {planLimits.map(plan => (
                  <tr
                    key={plan.plan}
                    className="border-b align-top last:border-b-0"
                  >
                    <td className="px-3 py-2">
                      <p className="font-medium">{plan.displayName}</p>
                      <p className="max-w-72 text-xs text-muted-foreground">
                        {plan.description}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatInteger(plan.requestsPerDay)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatInteger(plan.requestsPerMinute)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatInteger(plan.tokensPerDay)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatInteger(plan.tokensPerMonth)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatInteger(plan.appGenerationsPerDay)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatInteger(plan.appProjectsPerUser)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatInteger(plan.presentationsPerMonth)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatInteger(plan.slidesPerMonth)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatInteger(plan.aiImagesPerMonth)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatInteger(plan.pptxExportsPerMonth)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatInteger(plan.apiCallsPerMinute)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatCents(plan.monthlyBudgetCents)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatInteger(plan.maxOutputTokens)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatInteger(plan.maxBuildRepairAttempts)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={apiAccessVariant(plan.apiAccess)}>
                        {plan.apiAccess}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Limit types</CardTitle>
          <CardDescription>
            Catalog of limit types Brok enforces across plans, users, and keys.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">ID</th>
                  <th className="px-3 py-2 text-left font-medium">Label</th>
                  <th className="px-3 py-2 text-left font-medium">Unit</th>
                  <th className="px-3 py-2 text-left font-medium">
                    Description
                  </th>
                </tr>
              </thead>
              <tbody>
                {limitTypes.map(limit => (
                  <tr key={limit.id} className="border-b last:border-b-0">
                    <td className="px-3 py-2 font-mono text-xs">{limit.id}</td>
                    <td className="px-3 py-2 font-medium">{limit.label}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {limit.unit}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {limit.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
