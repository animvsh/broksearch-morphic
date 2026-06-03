import Link from 'next/link'

import {
  getProvidersForAdmin,
  rotateProviderKey,
  setProviderFallback,
  toggleProviderEnabled
} from '@/lib/actions/admin-providers'
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

const TYPE_LABELS: Record<string, string> = {
  llm: 'LLM',
  search: 'Search',
  image: 'Image',
  'stock-media': 'Stock Media',
  export: 'Export',
  storage: 'Storage',
  'local-model': 'Local Model'
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return '0%'
  return `${value.toFixed(1)}%`
}

function formatUsd(value: number) {
  if (!Number.isFinite(value)) return '$0.0000'
  if (value < 0.01) return `$${value.toFixed(4)}`
  return `$${value.toFixed(2)}`
}

function formatInteger(value: number) {
  return value.toLocaleString()
}

function maskSecret(value: string) {
  if (!value) return '••••••••'
  return '••••' + value.slice(-2)
}

export default async function AdminProvidersPage() {
  await requirePageAuth('/admin/providers')
  const providers = await getProvidersForAdmin()
  const isDegraded =
    providers.length === 0 || providers.every(p => p.isFallback)
  const active = providers.filter(p => p.status === 'active').length
  const degraded = providers.filter(p => p.status === 'degraded').length
  const disabled = providers.filter(p => p.status === 'disabled').length

  return (
    <div className="space-y-6 px-4 pb-8 sm:px-6 lg:px-8">
      <nav className="flex flex-wrap gap-1 rounded-md border bg-muted/40 p-1 text-sm">
        {ADMIN_NAV.map(item => {
          const isActive = item.href === '/admin/providers'
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
          <h1 className="text-3xl font-bold">Providers Admin</h1>
          <p className="text-muted-foreground">
            Manage MiniMax, search, image, export, and local model providers.
            Secrets stay hidden — only metadata is exposed here.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
          <span>
            <span className="font-semibold text-foreground">
              {providers.length}
            </span>{' '}
            providers
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <span className="font-semibold text-foreground">{active}</span>{' '}
            active
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <span className="font-semibold text-foreground">{degraded}</span>{' '}
            degraded
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <span className="font-semibold text-foreground">{disabled}</span>{' '}
            disabled
          </span>
        </div>
      </div>

      {isDegraded ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Showing fallback catalog data while database connectivity recovers.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Provider catalog</CardTitle>
          <CardDescription>
            Toggle providers, mark a fallback, and request key rotation. Cost
            and latency roll up from today&apos;s usage events.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[1100px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Provider</th>
                  <th className="px-3 py-2 text-left font-medium">Type</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Requests Today
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Cost Today
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Avg Latency
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Error Rate
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Rate Limit Errors
                  </th>
                  <th className="px-3 py-2 text-left font-medium">
                    Last Error
                  </th>
                  <th className="px-3 py-2 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {providers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-3 py-6 text-center text-muted-foreground"
                    >
                      No providers configured.
                    </td>
                  </tr>
                ) : (
                  providers.map(provider => (
                    <tr
                      key={provider.id}
                      className="border-b align-top last:border-b-0"
                    >
                      <td className="px-3 py-3">
                        <p className="font-medium">{provider.name}</p>
                        <p className="font-mono text-xs text-muted-foreground">
                          key: {maskSecret(provider.id)}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant="outline">
                          {TYPE_LABELS[provider.type] ?? provider.type}
                        </Badge>
                      </td>
                      <td className="px-3 py-3">
                        <Badge
                          variant={
                            provider.status === 'active'
                              ? 'default'
                              : provider.status === 'degraded'
                                ? 'secondary'
                                : 'destructive'
                          }
                        >
                          {provider.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-right">
                        {formatInteger(provider.requestsToday)}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {formatUsd(provider.costToday)}
                      </td>
                      <td className="px-3 py-3 text-right text-muted-foreground">
                        {provider.avgLatencyMs > 0
                          ? `${provider.avgLatencyMs}ms`
                          : '—'}
                      </td>
                      <td className="px-3 py-3 text-right text-muted-foreground">
                        {provider.requestsToday > 0
                          ? formatPercent(provider.errorRate)
                          : '—'}
                      </td>
                      <td className="px-3 py-3 text-right text-muted-foreground">
                        {formatInteger(provider.rateLimitErrors)}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {provider.lastError ?? '—'}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col gap-1">
                          {provider.isFallback ? (
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              catalog only
                            </span>
                          ) : (
                            <>
                              <form action={toggleProviderEnabled}>
                                <input
                                  type="hidden"
                                  name="providerName"
                                  value={provider.name}
                                />
                                <input
                                  type="hidden"
                                  name="enabled"
                                  value={String(provider.status === 'disabled')}
                                />
                                <Button
                                  size="sm"
                                  variant="outline"
                                  type="submit"
                                  className="h-7 px-2 text-xs"
                                >
                                  {provider.status === 'disabled'
                                    ? 'Enable'
                                    : 'Disable'}
                                </Button>
                              </form>
                              <form action={setProviderFallback}>
                                <input
                                  type="hidden"
                                  name="providerName"
                                  value={provider.name}
                                />
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  type="submit"
                                  className="h-7 px-2 text-xs"
                                >
                                  Set fallback
                                </Button>
                              </form>
                              <form action={rotateProviderKey}>
                                <input
                                  type="hidden"
                                  name="providerName"
                                  value={provider.name}
                                />
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  type="submit"
                                  className="h-7 px-2 text-xs"
                                >
                                  Rotate key
                                </Button>
                              </form>
                            </>
                          )}
                        </div>
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
