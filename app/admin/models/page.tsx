import Link from 'next/link'

import {
  getModelsForAdmin,
  toggleModelEnabled,
  updateModelPricing
} from '@/lib/actions/admin-models'
import { requirePageAuth } from '@/lib/auth/require-page-auth'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  starter: 'Starter',
  pro: 'Pro',
  team: 'Team',
  scale: 'Scale',
  enterprise: 'Enterprise'
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return '0%'
  return `${value.toFixed(1)}%`
}

function formatCompactUsd(value: number) {
  if (!Number.isFinite(value)) return '$0.00'
  if (value < 0.01) return '<$0.01'
  return `$${value.toFixed(2)}`
}

function formatInteger(value: number | null | undefined) {
  if (value === null || value === undefined) return '—'
  return value.toLocaleString()
}

export default async function AdminModelsPage() {
  await requirePageAuth('/admin/models')
  const models = await getModelsForAdmin()
  const isDegraded = models.length === 0 || models.every(m => m.isFallback)
  const activeCount = models.filter(m => m.enabled).length

  return (
    <div className="space-y-6 px-4 pb-8 sm:px-6 lg:px-8">
      <nav className="flex flex-wrap gap-1 rounded-md border bg-muted/40 p-1 text-sm">
        {ADMIN_NAV.map(item => {
          const isActive = item.href === '/admin/models'
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
          <h1 className="text-3xl font-bold">Models Admin</h1>
          <p className="text-muted-foreground">
            Manage Brok&apos;s public model names, providers, pricing, and plan
            access.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
          <span>
            <span className="font-semibold text-foreground">
              {models.length}
            </span>{' '}
            models
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <span className="font-semibold text-foreground">{activeCount}</span>{' '}
            enabled
          </span>
        </div>
      </div>

      {isDegraded ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Showing fallback catalog data while database connectivity recovers.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Models tracked
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{models.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Includes both Brok public IDs and provider aliases.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg input cost
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {formatCompactUsd(
                models.length === 0
                  ? 0
                  : models.reduce((sum, m) => sum + m.inputCostPerMillion, 0) /
                      models.length
              )}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Per 1M input tokens (USD).
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg error rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {formatPercent(
                models.length === 0
                  ? 0
                  : models.reduce((sum, m) => sum + m.errorRate, 0) /
                      models.length
              )}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Computed from today&apos;s usage events.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Model catalog</CardTitle>
          <CardDescription>
            Toggle availability, set pricing, and adjust plan access for each
            Brok model.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[1100px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">
                    Brok Model
                  </th>
                  <th className="px-3 py-2 text-left font-medium">Used For</th>
                  <th className="px-3 py-2 text-left font-medium">Provider</th>
                  <th className="px-3 py-2 text-left font-medium">
                    Provider Model
                  </th>
                  <th className="px-3 py-2 text-left font-medium">Enabled</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Input $/M
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Output $/M
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Avg Latency
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Error Rate
                  </th>
                  <th className="px-3 py-2 text-left font-medium">
                    Plans Allowed
                  </th>
                </tr>
              </thead>
              <tbody>
                {models.length === 0 ? (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-3 py-6 text-center text-muted-foreground"
                    >
                      No models configured.
                    </td>
                  </tr>
                ) : (
                  models.map(model => (
                    <tr
                      key={model.brokModel}
                      className="border-b align-top last:border-b-0"
                    >
                      <td className="px-3 py-3">
                        <p className="font-medium">{model.brokModel}</p>
                        <p className="text-xs text-muted-foreground">
                          {model.displayName}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {model.usedFor}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs">
                        {model.provider}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs">
                        {model.providerModel}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col items-start gap-1">
                          <Badge
                            variant={model.enabled ? 'default' : 'secondary'}
                          >
                            {model.enabled ? 'Enabled' : 'Disabled'}
                          </Badge>
                          {!model.isFallback ? (
                            <form action={toggleModelEnabled}>
                              <input type="hidden" name="id" value={model.id} />
                              <input
                                type="hidden"
                                name="enabled"
                                value={String(!model.enabled)}
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                type="submit"
                                className="h-7 px-2 text-xs"
                              >
                                {model.enabled ? 'Disable' : 'Enable'}
                              </Button>
                            </form>
                          ) : (
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              catalog only
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right">
                        {model.isFallback ? (
                          <span>
                            {formatCompactUsd(model.inputCostPerMillion)}
                          </span>
                        ) : (
                          <form
                            action={updateModelPricing}
                            className="flex items-center justify-end gap-1"
                          >
                            <input type="hidden" name="id" value={model.id} />
                            <input
                              type="number"
                              step="0.0001"
                              min="0"
                              name="inputCostPerMillion"
                              defaultValue={model.inputCostPerMillion}
                              className="h-7 w-20 rounded-md border bg-background px-2 text-right text-xs"
                            />
                            <Button
                              type="submit"
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                            >
                              Save
                            </Button>
                          </form>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {model.isFallback ? (
                          <span>
                            {formatCompactUsd(model.outputCostPerMillion)}
                          </span>
                        ) : (
                          <form
                            action={updateModelPricing}
                            className="flex items-center justify-end gap-1"
                          >
                            <input type="hidden" name="id" value={model.id} />
                            <input
                              type="number"
                              step="0.0001"
                              min="0"
                              name="outputCostPerMillion"
                              defaultValue={model.outputCostPerMillion}
                              className="h-7 w-20 rounded-md border bg-background px-2 text-right text-xs"
                            />
                            <Button
                              type="submit"
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                            >
                              Save
                            </Button>
                          </form>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right text-muted-foreground">
                        {model.avgLatencyMs > 0
                          ? `${model.avgLatencyMs}ms`
                          : '—'}
                      </td>
                      <td className="px-3 py-3 text-right text-muted-foreground">
                        {model.requestsToday > 0
                          ? formatPercent(model.errorRate)
                          : '—'}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex max-w-56 flex-wrap gap-1">
                          {model.allowedPlans.length === 0 ? (
                            <span className="text-xs text-muted-foreground">
                              None
                            </span>
                          ) : (
                            model.allowedPlans.map(plan => (
                              <Badge
                                key={plan}
                                variant="outline"
                                className="text-[10px]"
                              >
                                {PLAN_LABELS[plan] ?? plan}
                              </Badge>
                            ))
                          )}
                        </div>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {formatInteger(model.requestsToday)} req today · max
                          tokens {formatInteger(model.maxTokens)}
                        </p>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
