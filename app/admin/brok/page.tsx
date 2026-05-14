import Link from 'next/link'

import { getBrokStats } from '@/lib/actions/admin-brok'
import { requirePageAuth } from '@/lib/auth/require-page-auth'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

function formatCompact(value: number) {
  return new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(value)
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value > 10 ? 2 : 4,
    maximumFractionDigits: value > 10 ? 2 : 4
  }).format(value)
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value))
}

function formatShortDay(value: string) {
  const [, month, day] = value.split('-')
  return `${Number(month)}/${Number(day)}`
}

function StatCard({
  label,
  value,
  detail
}: {
  label: string
  value: string
  detail?: string
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {detail ? (
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        ) : null}
      </CardContent>
    </Card>
  )
}

function TrendBars({
  data,
  metric
}: {
  data: Array<{
    day: string
    requests: number
    tokens: number
    failedRequests: number
  }>
  metric: 'requests' | 'tokens'
}) {
  const maxValue = Math.max(...data.map(point => point[metric]), 1)

  return (
    <div className="space-y-4">
      <div className="flex h-56 items-end gap-2 rounded-md border bg-muted/20 px-3 pb-8 pt-4">
        {data.map(point => {
          const value = point[metric]
          const height = Math.max((value / maxValue) * 100, value > 0 ? 6 : 1)

          return (
            <div
              key={point.day}
              className="group relative flex min-w-0 flex-1 flex-col items-center justify-end"
            >
              <div
                className="w-full rounded-t-sm bg-primary/85 transition-colors group-hover:bg-primary"
                style={{ height: `${height}%` }}
              />
              {point.failedRequests > 0 ? (
                <div
                  className="absolute bottom-0 w-full rounded-t-sm bg-destructive/75"
                  style={{
                    height: `${Math.max((point.failedRequests / maxValue) * 100, 4)}%`
                  }}
                />
              ) : null}
              <div className="pointer-events-none absolute bottom-full mb-2 hidden min-w-28 rounded-md border bg-popover px-2 py-1 text-xs shadow-sm group-hover:block">
                <p className="font-medium">{formatShortDay(point.day)}</p>
                <p>{formatCompact(point.requests)} runs</p>
                <p>{formatCompact(point.tokens)} tokens</p>
                {point.failedRequests > 0 ? (
                  <p className="text-destructive">
                    {point.failedRequests} failed
                  </p>
                ) : null}
              </div>
              <span className="absolute -bottom-6 hidden text-[10px] text-muted-foreground sm:block">
                {formatShortDay(point.day)}
              </span>
            </div>
          )
        })}
      </div>
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-2 rounded-sm bg-primary" />
          {metric === 'requests' ? 'Runs' : 'Tokens'}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-2 rounded-sm bg-destructive" />
          Failed runs
        </span>
      </div>
    </div>
  )
}

function SplitBars({
  rows,
  labelKey
}: {
  rows: Array<{
    requests: number
    tokens: number
    percentage: number
    avgLatencyMs?: number
    [key: string]: string | number | undefined
  }>
  labelKey: string
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No usage data yet</p>
  }

  return (
    <div className="space-y-4">
      {rows.map(row => {
        const label = String(row[labelKey] ?? 'unknown')

        return (
          <div key={label}>
            <div className="mb-1 flex items-center justify-between gap-4">
              <span className="truncate text-sm font-medium">{label}</span>
              <span className="text-sm text-muted-foreground">
                {row.percentage.toFixed(1)}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.max(row.percentage, 2)}%` }}
              />
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>{formatCompact(row.requests)} runs</span>
              <span>{formatCompact(row.tokens)} tokens</span>
              {typeof row.avgLatencyMs === 'number' ? (
                <span>{row.avgLatencyMs}ms avg</span>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default async function BrokAdminPage() {
  await requirePageAuth('/admin/brok')
  const stats = await getBrokStats()
  const brokCode = stats.brokCode

  return (
    <div className="space-y-8 px-4 pb-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Brok API</h1>
          <p className="text-muted-foreground">
            Platform health, BrokCode usage, key activity, and cost telemetry.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/brok/logs?endpoint=code"
            className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            Code logs
          </Link>
          <Link
            href="/admin/brok/api-keys"
            className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            API keys
          </Link>
          <Link
            href="/admin/brok/providers"
            className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            Providers
          </Link>
        </div>
      </div>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">BrokCode Usage</h2>
          <p className="text-sm text-muted-foreground">
            Live coding-agent traffic across browser, cloud, and TUI runs.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="BrokCode Runs Today"
            value={brokCode.today.requests.toLocaleString()}
            detail={`${brokCode.today.successRate.toFixed(1)}% success`}
          />
          <StatCard
            label="BrokCode Tokens Today"
            value={formatCompact(brokCode.today.tokens)}
            detail={`${brokCode.today.avgLatencyMs}ms average latency`}
          />
          <StatCard
            label="7 Day BrokCode Runs"
            value={brokCode.last7Days.requests.toLocaleString()}
            detail={`${brokCode.last7Days.activeUsers} users · ${brokCode.last7Days.activeApiKeys} keys`}
          />
          <StatCard
            label="7 Day BrokCode Cost"
            value={formatCurrency(brokCode.last7Days.revenue)}
            detail={`${formatCurrency(brokCode.last7Days.providerCost)} provider cost`}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.6fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>BrokCode Runs Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <TrendBars data={brokCode.dailyUsage} metric="requests" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Runtime Split</CardTitle>
            </CardHeader>
            <CardContent>
              <SplitBars rows={brokCode.runtimeSplit} labelKey="provider" />
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>BrokCode Token Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <TrendBars data={brokCode.dailyUsage} metric="tokens" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Endpoint Mix</CardTitle>
            </CardHeader>
            <CardContent>
              <SplitBars rows={brokCode.endpointSplit} labelKey="endpoint" />
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 2xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Top BrokCode Users</CardTitle>
            </CardHeader>
            <CardContent>
              {brokCode.topUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No BrokCode users yet
                </p>
              ) : (
                <div className="space-y-4">
                  {brokCode.topUsers.map(user => (
                    <div
                      key={user.id}
                      className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{user.email}</p>
                        <p className="truncate text-sm text-muted-foreground">
                          {user.workspace}
                        </p>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-right text-sm">
                        <div>
                          <p className="font-medium">
                            {user.requests.toLocaleString()}
                          </p>
                          <p className="text-xs text-muted-foreground">runs</p>
                        </div>
                        <div>
                          <p className="font-medium">
                            {formatCompact(user.tokens)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            tokens
                          </p>
                        </div>
                        <div>
                          <p className="font-medium">{user.avgLatencyMs}ms</p>
                          <p className="text-xs text-muted-foreground">avg</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top BrokCode Keys</CardTitle>
            </CardHeader>
            <CardContent>
              {brokCode.topApiKeys.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No BrokCode API key activity yet
                </p>
              ) : (
                <div className="space-y-4">
                  {brokCode.topApiKeys.map(key => (
                    <div
                      key={key.id}
                      className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{key.name}</p>
                        <p className="truncate font-mono text-xs text-muted-foreground">
                          {key.prefix}... · {key.workspace}
                        </p>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-right text-sm">
                        <div>
                          <p className="font-medium">
                            {key.requests.toLocaleString()}
                          </p>
                          <p className="text-xs text-muted-foreground">runs</p>
                        </div>
                        <div>
                          <p className="font-medium">
                            {formatCompact(key.tokens)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            tokens
                          </p>
                        </div>
                        <div>
                          <p className="font-medium">
                            {formatDateTime(key.lastUsedAt)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            last used
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Recent BrokCode Runs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="py-2 pr-4 text-left font-medium">Request</th>
                    <th className="py-2 pr-4 text-left font-medium">User</th>
                    <th className="py-2 pr-4 text-left font-medium">Key</th>
                    <th className="py-2 pr-4 text-left font-medium">Runtime</th>
                    <th className="py-2 pr-4 text-left font-medium">Model</th>
                    <th className="py-2 pr-4 text-right font-medium">Tokens</th>
                    <th className="py-2 pr-4 text-right font-medium">
                      Latency
                    </th>
                    <th className="py-2 pr-4 text-left font-medium">Status</th>
                    <th className="py-2 text-left font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {brokCode.recentRuns.length === 0 ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="py-8 text-center text-muted-foreground"
                      >
                        No BrokCode runs yet
                      </td>
                    </tr>
                  ) : (
                    brokCode.recentRuns.map(run => (
                      <tr key={run.id} className="border-b last:border-b-0">
                        <td className="py-3 pr-4 font-mono text-xs">
                          {run.requestId.slice(0, 14)}...
                        </td>
                        <td className="py-3 pr-4">
                          <p className="max-w-44 truncate font-medium">
                            {run.email}
                          </p>
                          <p className="max-w-44 truncate text-xs text-muted-foreground">
                            {run.workspace}
                          </p>
                        </td>
                        <td className="py-3 pr-4">{run.apiKeyName}</td>
                        <td className="py-3 pr-4">{run.provider}</td>
                        <td className="py-3 pr-4">{run.model}</td>
                        <td className="py-3 pr-4 text-right">
                          {run.tokens.toLocaleString()}
                        </td>
                        <td className="py-3 pr-4 text-right">
                          {run.latencyMs}ms
                        </td>
                        <td className="py-3 pr-4">
                          <Badge
                            variant={
                              run.status === 'success'
                                ? 'default'
                                : 'destructive'
                            }
                          >
                            {run.status}
                          </Badge>
                          {run.errorCode ? (
                            <p className="mt-1 max-w-36 truncate text-xs text-destructive">
                              {run.errorCode}
                            </p>
                          ) : null}
                        </td>
                        <td className="py-3">
                          {formatDateTime(run.createdAt)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Overall Brok API</h2>
          <p className="text-sm text-muted-foreground">
            Daily platform totals across chat, search, code, and agents.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Requests Today"
            value={stats.requestsToday.toLocaleString()}
          />
          <StatCard
            label="Tokens Today"
            value={formatCompact(stats.tokensToday)}
          />
          <StatCard
            label="Revenue Today"
            value={formatCurrency(stats.revenueToday)}
          />
          <StatCard
            label="Provider Cost Today"
            value={formatCurrency(stats.providerCostToday)}
          />
          <StatCard
            label="Gross Margin"
            value={`${
              stats.revenueToday > 0
                ? (
                    (1 - stats.providerCostToday / stats.revenueToday) *
                    100
                  ).toFixed(1)
                : 0
            }%`}
          />
          <StatCard
            label="Failed Requests"
            value={stats.failedRequests.toLocaleString()}
          />
          <StatCard label="Avg Latency" value={`${stats.avgLatencyMs}ms`} />
          <StatCard
            label="Active API Keys"
            value={stats.activeApiKeys.toLocaleString()}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Top Users by Usage</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {stats.topUsersByUsage.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No usage data yet
                  </p>
                ) : (
                  stats.topUsersByUsage.map(user => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{user.email}</p>
                        <p className="truncate text-sm text-muted-foreground">
                          {user.workspace}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">
                          {user.requestsToday.toLocaleString()} req
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {formatCurrency(user.costToday)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Model Usage Split</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {stats.modelUsage.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No usage data yet
                  </p>
                ) : (
                  stats.modelUsage.map(model => (
                    <div key={model.id}>
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-sm font-medium">{model.id}</span>
                        <span className="text-sm text-muted-foreground">
                          {model.percentage.toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${model.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}
