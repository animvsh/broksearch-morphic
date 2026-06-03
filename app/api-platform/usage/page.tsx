import Link from 'next/link'
import { redirect } from 'next/navigation'

import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Gauge,
  KeyRound,
  ReceiptText,
  Zap
} from 'lucide-react'

import { getUsageDashboardData } from '@/lib/actions/platform-dashboard'
import { requireFeatureAccess } from '@/lib/auth/app-access'

import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'

export const dynamic = 'force-dynamic'

function compact(value: number) {
  return Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(value)
}

function currency(value: number) {
  return Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 4
  }).format(value)
}

function formatDate(value: Date | string | null) {
  if (!value) return 'Never'
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

export default async function UsagePage() {
  const user = await requireFeatureAccess('/api-platform/usage', 'api_platform')
  if (!user) {
    redirect(
      `/auth/login?redirectTo=${encodeURIComponent('/api-platform/usage')}`
    )
  }

  const data = await getUsageDashboardData(user.id)

  return (
    <div className="space-y-6">
      <section className="grid gap-5 xl:grid-cols-[1.35fr_0.9fr]">
        <Card className="overflow-hidden rounded-xl shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BarChart3 className="size-4" />
              Daily usage
            </CardTitle>
            <CardDescription>
              Last 30 days of API, BrokCode, browser, and saved-runtime usage.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.daily.length === 0 ? (
              <EmptyState text="No usage events recorded in the last 30 days." />
            ) : (
              <div className="space-y-3">
                {data.daily.map(day => (
                  <div key={day.day} className="rounded-lg border p-3">
                    <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                      <span>{day.day}</span>
                      <span>
                        {day.requests} req · {compact(day.tokens)} tokens ·{' '}
                        {currency(day.billedUsd)}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{
                          width: `${Math.max(
                            4,
                            (day.requests /
                              Math.max(
                                ...data.daily.map(row => row.requests),
                                1
                              )) *
                              100
                          )}%`
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-xl shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Activity className="size-4" />
              Endpoint Mix
            </CardTitle>
            <CardDescription>
              Request volume by product endpoint.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.endpointSplit.length === 0 ? (
              <EmptyState text="Endpoint usage appears after live requests." />
            ) : (
              <div className="space-y-3">
                {data.endpointSplit.map(row => (
                  <div key={row.label} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium capitalize">{row.label}</p>
                      <Badge variant="outline">{row.requests} req</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {compact(row.tokens)} tokens
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <Card className="overflow-hidden rounded-xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Key Breakdown</CardTitle>
            <CardDescription>
              Which API keys or saved runtime keys are driving usage.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.keyUsage.length === 0 ? (
              <EmptyState text="No per-key usage yet." />
            ) : (
              <div className="divide-y overflow-hidden rounded-xl border">
                {data.keyUsage.map(key => (
                  <div
                    key={key.id}
                    className="grid gap-3 p-3 text-sm md:grid-cols-[1fr_auto]"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{key.name}</p>
                      <p className="truncate font-mono text-xs text-muted-foreground">
                        {key.prefix}
                      </p>
                    </div>
                    <div className="text-left text-xs text-muted-foreground md:text-right">
                      <p>
                        {key.requests} req · {compact(key.tokens)} tokens
                      </p>
                      <p>{currency(key.billedUsd)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Recent Events</CardTitle>
            <CardDescription>
              Latest usage ledger rows across all surfaces.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.recentEvents.length === 0 ? (
              <EmptyState text="No request ledger entries yet." />
            ) : (
              <div className="max-h-[520px] overflow-auto rounded-xl border">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="sticky top-0 bg-background">
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="p-3 font-medium">Time</th>
                      <th className="p-3 font-medium">Endpoint</th>
                      <th className="p-3 font-medium">Model</th>
                      <th className="p-3 font-medium">Surface</th>
                      <th className="p-3 text-right font-medium">Tokens</th>
                      <th className="p-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentEvents.map(event => {
                      const tokens =
                        (event.inputTokens ?? 0) + (event.outputTokens ?? 0)
                      return (
                        <tr key={event.id} className="border-b last:border-b-0">
                          <td className="p-3 text-xs text-muted-foreground">
                            {formatDate(event.createdAt)}
                          </td>
                          <td className="p-3 capitalize">{event.endpoint}</td>
                          <td className="p-3">{event.model}</td>
                          <td className="p-3">{event.surface}</td>
                          <td className="p-3 text-right">
                            {tokens.toLocaleString()}
                          </td>
                          <td className="p-3">
                            <Badge
                              variant={
                                event.status === 'success'
                                  ? 'secondary'
                                  : 'destructive'
                              }
                              className="gap-1"
                            >
                              {event.status !== 'success' ? (
                                <AlertTriangle className="size-3" />
                              ) : null}
                              {event.status}
                            </Badge>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
      {text}
    </div>
  )
}
