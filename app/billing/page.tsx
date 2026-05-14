import Link from 'next/link'
import { redirect } from 'next/navigation'

import { CreditCard, Gauge, KeyRound, ShieldCheck } from 'lucide-react'

import { getUsageDashboardData } from '@/lib/actions/platform-dashboard'
import { getRequiredBrokAccountUser } from '@/lib/brokcode/account-guard'

import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'

export const dynamic = 'force-dynamic'

const PLAN_LIMITS: Record<string, string[]> = {
  free: ['Personal workspace', 'Scoped API keys', 'Usage ledger'],
  starter: [
    'Higher request ceilings',
    'Monthly budget controls',
    'API support'
  ],
  pro: ['BrokCode runtime usage', 'Team-ready analytics', 'Provider routing'],
  team: ['Shared operations view', 'Admin dashboards', 'Central key controls'],
  scale: ['Custom limits', 'Provider cost controls', 'Dedicated support'],
  enterprise: ['Custom contracts', 'Security review', 'Managed rollout']
}

function currency(value: number, fractionDigits = 2) {
  return Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: fractionDigits
  }).format(value)
}

function compact(value: number) {
  return Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(value)
}

function cents(value: number | null | undefined) {
  return currency((value ?? 0) / 100, 0)
}

export default async function BillingPage() {
  const user = await getRequiredBrokAccountUser()
  if (!user) {
    redirect(`/auth/login?redirectTo=${encodeURIComponent('/billing')}`)
  }

  const data = await getUsageDashboardData(user.id)
  const workspaceBudget = data.workspace.monthlyBudgetCents ?? 0
  const keyBudget = data.apiKeys.reduce(
    (sum, key) => sum + (key.monthlyBudgetCents ?? 0),
    0
  )
  const effectiveBudget = workspaceBudget || keyBudget
  const budgetUsd = effectiveBudget / 100
  const budgetUsed =
    budgetUsd > 0
      ? Math.min(100, (data.totals.billedUsd30d / budgetUsd) * 100)
      : 0
  const currentPlanFeatures =
    PLAN_LIMITS[data.workspace.plan] ?? PLAN_LIMITS.free

  return (
    <div className="dashboard-shell min-h-svh px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-3 rounded-lg border bg-background/90 p-5 shadow-sm lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Badge variant="outline" className="mb-3">
              Billing
            </Badge>
            <h1 className="text-3xl font-semibold tracking-normal">
              Billing & Limits
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Plan, budget, API-key limits, and usage-based spend for{' '}
              {data.workspace.name}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/usage"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border px-4 text-sm font-medium hover:bg-muted"
            >
              <Gauge className="size-4" />
              Usage
            </Link>
            <Link
              href="/api-keys/new"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <KeyRound className="size-4" />
              New key
            </Link>
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CreditCard className="size-4" />
                Current Plan
              </CardTitle>
              <CardDescription>
                Workspace status and included controls.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-2xl font-semibold capitalize">
                      {data.workspace.plan}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground capitalize">
                      {data.workspace.status}
                    </p>
                  </div>
                  <Badge>{data.apiKeys.length} keys</Badge>
                </div>
                <div className="mt-5 space-y-2">
                  {currentPlanFeatures.map(feature => (
                    <p
                      key={feature}
                      className="flex items-center gap-2 text-sm text-muted-foreground"
                    >
                      <ShieldCheck className="size-4 text-primary" />
                      {feature}
                    </p>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="text-lg">Monthly Spend</CardTitle>
              <CardDescription>
                Uses the existing Brok usage ledger and monthly budget limits.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <BillingMetric
                  label="30d spend"
                  value={currency(data.totals.billedUsd30d, 4)}
                />
                <BillingMetric
                  label="Budget"
                  value={effectiveBudget ? cents(effectiveBudget) : 'Not set'}
                />
                <BillingMetric
                  label="30d requests"
                  value={compact(data.totals.requests30d)}
                />
              </div>
              <div className="mt-5">
                <div className="mb-2 flex justify-between text-xs text-muted-foreground">
                  <span>Budget usage</span>
                  <span>
                    {effectiveBudget
                      ? `${budgetUsed.toFixed(1)}%`
                      : 'No budget cap'}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${effectiveBudget ? budgetUsed : 0}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="text-lg">Key Limits</CardTitle>
              <CardDescription>
                RPM, daily request, model, scope, and monthly budget controls
                configured on each key.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.apiKeys.length === 0 ? (
                <EmptyState text="Create an API key to configure spend and rate limits." />
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full min-w-[820px] text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                        <th className="p-3 font-medium">Key</th>
                        <th className="p-3 font-medium">Status</th>
                        <th className="p-3 text-right font-medium">RPM</th>
                        <th className="p-3 text-right font-medium">Daily</th>
                        <th className="p-3 text-right font-medium">Budget</th>
                        <th className="p-3 font-medium">Scopes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.apiKeys.map(key => (
                        <tr key={key.id} className="border-b last:border-b-0">
                          <td className="p-3">
                            <p className="font-medium">{key.name}</p>
                            <p className="font-mono text-xs text-muted-foreground">
                              {key.keyPrefix}...
                            </p>
                          </td>
                          <td className="p-3">
                            <Badge
                              variant={
                                key.status === 'active'
                                  ? 'secondary'
                                  : 'outline'
                              }
                              className="capitalize"
                            >
                              {key.status}
                            </Badge>
                          </td>
                          <td className="p-3 text-right">
                            {(key.rpmLimit ?? 0).toLocaleString()}
                          </td>
                          <td className="p-3 text-right">
                            {(key.dailyRequestLimit ?? 0).toLocaleString()}
                          </td>
                          <td className="p-3 text-right">
                            {key.monthlyBudgetCents
                              ? cents(key.monthlyBudgetCents)
                              : 'None'}
                          </td>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-1">
                              {(key.scopes ?? []).slice(0, 3).map(scope => (
                                <Badge key={scope} variant="outline">
                                  {scope}
                                </Badge>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="text-lg">Controls In Effect</CardTitle>
              <CardDescription>
                The billing surface reflects controls currently enforced by the
                API platform.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <Control label="Per-key RPM limits" active />
                <Control label="Daily request limits" active />
                <Control label="Monthly key budgets" active />
                <Control label="Scoped endpoints" active />
                <Control label="Allowed model lists" active />
                <Control label="Stripe checkout" active={false} />
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  )
}

function BillingMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background/70 p-4">
      <p className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-xl font-semibold">{value}</p>
    </div>
  )
}

function Control({ label, active }: { label: string; active: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
      <span>{label}</span>
      <Badge variant={active ? 'secondary' : 'outline'}>
        {active ? 'Live' : 'Not wired'}
      </Badge>
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
