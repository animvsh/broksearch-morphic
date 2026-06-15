import Link from 'next/link'

import { getCostsData } from '@/lib/actions/admin-costs'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value > 10 ? 2 : 4,
    maximumFractionDigits: value > 10 ? 2 : 4
  }).format(value)
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en').format(value)
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`
}

function StatCard({
  label,
  value,
  detail,
  tone
}: {
  label: string
  value: string
  detail?: string
  tone?: 'default' | 'positive' | 'negative' | 'warning'
}) {
  const toneClass =
    tone === 'positive'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'negative'
        ? 'text-destructive'
        : tone === 'warning'
          ? 'text-amber-600 dark:text-amber-400'
          : ''

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${toneClass}`}>{value}</div>
        {detail ? (
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        ) : null}
      </CardContent>
    </Card>
  )
}

function BreakdownBars({
  title,
  rows,
  totalLabel
}: {
  title: string
  rows: Array<{
    label: string
    providerCost: number
    requests: number
    percentage: number
  }>
  totalLabel?: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {totalLabel ? (
          <p className="text-sm text-muted-foreground">{totalLabel}</p>
        ) : null}
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No usage yet</p>
        ) : (
          <div className="space-y-4">
            {rows.map(row => (
              <div key={row.label}>
                <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                  <span className="truncate font-medium">{row.label}</span>
                  <span className="text-muted-foreground">
                    {formatCurrency(row.providerCost)} ·{' '}
                    {row.percentage.toFixed(1)}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.max(row.percentage, 2)}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatNumber(row.requests)} requests
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function RiskBadge({ risk }: { risk: 'low' | 'medium' | 'high' }) {
  if (risk === 'high') {
    return <Badge variant="destructive">High risk</Badge>
  }
  if (risk === 'medium') {
    return <Badge variant="secondary">Watch</Badge>
  }
  return <Badge variant="outline">Healthy</Badge>
}

function AlertCard({ alert }: { alert: ReturnType<typeof Object> | any }) {
  const severityClasses: Record<string, string> = {
    critical: 'border-destructive/50 bg-destructive/5',
    warning: 'border-amber-500/50 bg-amber-50 dark:bg-amber-950/20',
    info: 'border-blue-500/40 bg-blue-50 dark:bg-blue-950/20'
  }
  const tone = severityClasses[alert.severity as string] ?? severityClasses.info
  return (
    <div
      className={`rounded-lg border p-4 text-sm ${tone}`}
      data-alert-id={alert.id}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{alert.title}</p>
          <p className="mt-1 text-muted-foreground">{alert.detail}</p>
        </div>
        <Badge
          variant={
            alert.severity === 'critical'
              ? 'destructive'
              : alert.severity === 'warning'
                ? 'secondary'
                : 'outline'
          }
        >
          {alert.severity}
        </Badge>
      </div>
      {alert.href ? (
        <Link
          href={alert.href}
          className="mt-3 inline-flex min-h-11 min-w-11 items-center rounded-md px-2 text-xs font-medium text-primary hover:underline"
        >
          Investigate →
        </Link>
      ) : null}
    </div>
  )
}

export default async function AdminCostsPage() {
  const data = await getCostsData()
  const { overview, breakdown, featureSplit, marginTable, alerts } = data

  return (
    <div className="space-y-8 px-4 pb-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Costs</h1>
          <p className="text-muted-foreground">
            Make sure Brok does not lose money. Live provider cost, billed
            revenue, and margin breakdown.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/billing"
            className="inline-flex min-h-11 min-w-11 items-center rounded-md border px-3 text-sm font-medium hover:bg-muted"
          >
            Billing admin
          </Link>
          <Link
            href="/admin/brok"
            className="inline-flex min-h-11 min-w-11 items-center rounded-md border px-3 text-sm font-medium hover:bg-muted"
          >
            Brok API
          </Link>
        </div>
      </div>

      <section className="space-y-4" id="overview">
        <div>
          <h2 className="text-lg font-semibold">Top cards</h2>
          <p className="text-sm text-muted-foreground">
            Provider cost, billed revenue, and margin for today and the current
            month.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Provider Cost Today"
            value={formatCurrency(overview.providerCostToday)}
            detail="Sum of provider_cost_usd from today"
          />
          <StatCard
            label="Provider Cost This Month"
            value={formatCurrency(overview.providerCostMonth)}
            detail="Month-to-date provider cost"
          />
          <StatCard
            label="Revenue Today"
            value={formatCurrency(overview.revenueToday)}
            detail="Sum of billed_usd from today"
          />
          <StatCard
            label="Revenue This Month"
            value={formatCurrency(overview.revenueMonth)}
            detail="Month-to-date billed revenue"
          />
          <StatCard
            label="Gross Margin"
            value={formatPercent(overview.grossMargin)}
            detail="Revenue minus provider cost / revenue"
            tone={
              overview.grossMargin >= 30
                ? 'positive'
                : overview.grossMargin >= 0
                  ? 'warning'
                  : 'negative'
            }
          />
          <StatCard
            label="Most Expensive User"
            value={
              overview.mostExpensiveUser
                ? formatCurrency(overview.mostExpensiveUser.cost)
                : '—'
            }
            detail={
              overview.mostExpensiveUser
                ? overview.mostExpensiveUser.email
                : 'No usage yet'
            }
          />
          <StatCard
            label="Most Expensive Feature"
            value={
              overview.mostExpensiveFeature
                ? formatCurrency(overview.mostExpensiveFeature.cost)
                : '—'
            }
            detail={
              overview.mostExpensiveFeature
                ? overview.mostExpensiveFeature.label
                : 'No usage yet'
            }
          />
          <StatCard
            label="Negative Margin Users"
            value={formatNumber(overview.negativeMarginUserCount)}
            detail="Users where provider cost > billed revenue"
            tone={
              overview.negativeMarginUserCount > 0 ? 'negative' : 'positive'
            }
          />
        </div>
      </section>

      <section className="space-y-4" id="features">
        <div>
          <h2 className="text-lg font-semibold">Feature Cost Split</h2>
          <p className="text-sm text-muted-foreground">
            Per-feature provider cost. Highlights the surface that is driving
            the most spend.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {featureSplit.map(row => (
            <Card key={row.key}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {row.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold">
                  {formatCurrency(row.providerCost)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {row.percentage.toFixed(1)}% of provider cost
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.max(row.percentage, 2)}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {formatNumber(row.requests)} requests
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Cost Breakdown</h2>
          <p className="text-sm text-muted-foreground">
            Provider cost sliced by feature, model, provider, user, workspace,
            project, presentation, and API key.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <BreakdownBars
            title="Cost by feature"
            rows={breakdown.byFeature}
            totalLabel="By endpoint enum"
          />
          <BreakdownBars
            title="Cost by model"
            rows={breakdown.byModel}
            totalLabel="Top 12 models by spend"
          />
          <BreakdownBars title="Cost by provider" rows={breakdown.byProvider} />
          <BreakdownBars
            title="Cost by user"
            rows={breakdown.byUser}
            totalLabel="Top 12 users"
          />
          <BreakdownBars
            title="Cost by workspace"
            rows={breakdown.byWorkspace}
          />
          <BreakdownBars
            title="Cost by project"
            rows={breakdown.byProject}
            totalLabel="App build sessions this month"
          />
          <BreakdownBars
            title="Cost by presentation"
            rows={breakdown.byPresentation}
            totalLabel="Presentation sessions this month"
          />
          <BreakdownBars
            title="Cost by API key"
            rows={breakdown.byApiKey}
            totalLabel="Top 12 keys by spend"
          />
        </div>
      </section>

      <section className="space-y-4" id="margin">
        <div>
          <h2 className="text-lg font-semibold">Margin Table</h2>
          <p className="text-sm text-muted-foreground">
            Per-user revenue vs provider cost. Risk flags users that are
            underwater.
          </p>
        </div>
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">User</th>
                    <th className="px-3 py-2 text-left font-medium">Plan</th>
                    <th className="px-3 py-2 text-right font-medium">
                      Revenue
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      Provider Cost
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      Gross Margin
                    </th>
                    <th className="px-3 py-2 text-left font-medium">
                      Top Feature
                    </th>
                    <th className="px-3 py-2 text-left font-medium">Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {marginTable.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-3 py-8 text-center text-muted-foreground"
                      >
                        No usage this month yet
                      </td>
                    </tr>
                  ) : (
                    marginTable.map(row => (
                      <tr key={row.userId} className="border-b last:border-0">
                        <td className="px-3 py-2">
                          <p className="max-w-[220px] truncate font-medium">
                            {row.email}
                          </p>
                          <p className="max-w-[220px] truncate text-xs text-muted-foreground">
                            {row.workspace}
                          </p>
                        </td>
                        <td className="px-3 py-2 capitalize">{row.plan}</td>
                        <td className="px-3 py-2 text-right">
                          {formatCurrency(row.revenue)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {formatCurrency(row.providerCost)}
                        </td>
                        <td
                          className={`px-3 py-2 text-right font-medium ${
                            row.grossMargin < 0
                              ? 'text-destructive'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {formatCurrency(row.grossMargin)}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {row.topFeature}
                        </td>
                        <td className="px-3 py-2">
                          <RiskBadge risk={row.risk} />
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

      <section className="space-y-4" id="alerts">
        <div>
          <h2 className="text-lg font-semibold">Alerts</h2>
          <p className="text-sm text-muted-foreground">
            Margin risks: user cost &gt; revenue, provider cost spikes, image
            generation spikes, failed build loops, presentation retries, and API
            key token abuse.
          </p>
        </div>
        {alerts.length === 0 ? (
          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground">
                No cost alerts firing. Brok is in the green this month.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {alerts.map(alert => (
              <AlertCard key={alert.id} alert={alert} />
            ))}
          </div>
        )}
        <div className="flex justify-end">
          <Button variant="outline" asChild>
            <Link
              href="/admin/brok/logs"
              className="inline-flex min-h-11 min-w-11 items-center"
            >
              Inspect detailed logs
            </Link>
          </Button>
        </div>
      </section>
    </div>
  )
}
