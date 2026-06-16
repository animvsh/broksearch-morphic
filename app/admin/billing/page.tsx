import Link from 'next/link'

import {
  applyCoupon,
  cancelSubscription,
  changePlan,
  getBillingOverview,
  issueRefund,
  pauseSubscription,
  setHardCap,
  setUsageCredits,
  viewInvoices
} from '@/lib/actions/admin-billing'
import type { BillingStatus } from '@/lib/billing/plans'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents >= 1000 ? 2 : 2,
    maximumFractionDigits: 2
  }).format(cents / 100)
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date(value))
}

function statusVariant(status: BillingStatus) {
  switch (status) {
    case 'active':
    case 'trialing':
      return 'default'
    case 'past_due':
    case 'unpaid':
      return 'secondary'
    case 'failed':
      return 'destructive'
    case 'canceled':
      return 'outline'
  }
}

function statusLabel(status: BillingStatus) {
  return status.replace('_', ' ')
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

const PLAN_OPTIONS = [
  'free',
  'starter',
  'pro',
  'team',
  'scale',
  'enterprise'
] as const

export default async function AdminBillingPage() {
  const data = await getBillingOverview()
  const {
    subscriptions,
    totalMRRCents,
    activeCustomers,
    trialingCustomers,
    pastDueCustomers,
    canceledCustomers,
    failedPayments,
    monthlyRevenueCents,
    monthlyUsageCents,
    monthlyOverageCents
  } = data

  return (
    <div className="space-y-8 px-4 pb-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Billing Admin</h1>
          <p className="text-muted-foreground">
            Manage subscriptions, MRR, plan changes, refunds, and Stripe
            customers across every workspace.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/costs"
            className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            Costs page
          </Link>
          <Link
            href="/admin/brok/api-keys"
            className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            API keys
          </Link>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="MRR"
          value={formatCurrency(totalMRRCents)}
          detail={`${activeCustomers + trialingCustomers} paying customers`}
        />
        <StatCard
          label="Revenue this month"
          value={formatCurrency(monthlyRevenueCents)}
          detail="Billed revenue this period"
        />
        <StatCard
          label="Usage this month"
          value={formatCurrency(monthlyUsageCents)}
          detail="Sum of billed usage"
        />
        <StatCard
          label="Overage this month"
          value={formatCurrency(monthlyOverageCents)}
          detail="Usage beyond plan credits"
          tone={monthlyOverageCents > 0 ? 'warning' : 'positive'}
        />
        <StatCard
          label="Active customers"
          value={String(activeCustomers)}
          detail="Currently subscribed"
          tone="positive"
        />
        <StatCard
          label="Trialing"
          value={String(trialingCustomers)}
          detail="In trial period"
        />
        <StatCard
          label="Past due"
          value={String(pastDueCustomers)}
          detail="Payment retry window"
          tone={pastDueCustomers > 0 ? 'warning' : 'default'}
        />
        <StatCard
          label="Failed / canceled"
          value={`${failedPayments} failed · ${canceledCustomers} canceled`}
          detail="Action required"
          tone={failedPayments + canceledCustomers > 0 ? 'negative' : 'default'}
        />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Subscriptions</h2>
          <p className="text-sm text-muted-foreground">
            One row per workspace. Use the inline actions to change plans, apply
            coupons, issue refunds, cancel, pause, set usage credits, set hard
            caps, or open the Stripe invoice list.
          </p>
        </div>
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">User</th>
                    <th className="px-3 py-2 text-left font-medium">
                      Workspace
                    </th>
                    <th className="px-3 py-2 text-left font-medium">Plan</th>
                    <th className="px-3 py-2 text-right font-medium">MRR</th>
                    <th className="px-3 py-2 text-right font-medium">
                      Usage This Month
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      Overage
                    </th>
                    <th className="px-3 py-2 text-left font-medium">
                      Payment Status
                    </th>
                    <th className="px-3 py-2 text-left font-medium">
                      Renewal Date
                    </th>
                    <th className="px-3 py-2 text-left font-medium">
                      Stripe Customer ID
                    </th>
                    <th className="px-3 py-2 text-left font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {subscriptions.length === 0 ? (
                    <tr>
                      <td
                        colSpan={10}
                        className="px-3 py-8 text-center text-muted-foreground"
                      >
                        No subscriptions yet
                      </td>
                    </tr>
                  ) : (
                    subscriptions.map(sub => (
                      <tr
                        key={sub.id}
                        className="border-b align-top last:border-0"
                      >
                        <td className="px-3 py-3">
                          <p className="max-w-[200px] truncate font-medium">
                            {sub.ownerEmail}
                          </p>
                          <p className="max-w-[200px] truncate text-xs text-muted-foreground">
                            {sub.ownerUserId}
                          </p>
                        </td>
                        <td className="px-3 py-3">
                          <p className="max-w-[200px] truncate font-medium">
                            {sub.workspaceName}
                          </p>
                          <p className="max-w-[200px] truncate text-xs text-muted-foreground">
                            {sub.stripeSubscriptionId}
                          </p>
                        </td>
                        <td className="px-3 py-3 capitalize">
                          <form action={changePlan} className="flex gap-1.5">
                            <input
                              type="hidden"
                              name="workspaceId"
                              value={sub.workspaceId}
                            />
                            <select
                              name="plan"
                              defaultValue={sub.plan}
                              className="h-8 rounded-md border bg-background px-2 text-xs capitalize"
                            >
                              {PLAN_OPTIONS.map(plan => (
                                <option key={plan} value={plan}>
                                  {plan}
                                </option>
                              ))}
                            </select>
                            <Button
                              type="submit"
                              size="sm"
                              variant="outline"
                              className="h-8"
                            >
                              Save
                            </Button>
                          </form>
                        </td>
                        <td className="px-3 py-3 text-right font-medium">
                          {formatCurrency(sub.mrrCents)}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {formatCurrency(sub.usageThisMonthCents)}
                        </td>
                        <td
                          className={`px-3 py-3 text-right ${
                            sub.overageCents > 0
                              ? 'font-medium text-amber-600 dark:text-amber-400'
                              : 'text-muted-foreground'
                          }`}
                        >
                          {formatCurrency(sub.overageCents)}
                        </td>
                        <td className="px-3 py-3">
                          <Badge variant={statusVariant(sub.status)}>
                            {statusLabel(sub.status)}
                          </Badge>
                          {sub.hasOutstandingInvoice ? (
                            <p className="mt-1 text-xs text-destructive">
                              Outstanding invoice
                            </p>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">
                          {formatDate(sub.renewalDate)}
                        </td>
                        <td className="px-3 py-3">
                          <p className="font-mono text-xs">
                            {sub.stripeCustomerId}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            PM •••• {sub.paymentMethodLast4}
                          </p>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-col gap-1.5">
                            <form action={applyCoupon} className="flex gap-1.5">
                              <input
                                type="hidden"
                                name="workspaceId"
                                value={sub.workspaceId}
                              />
                              <input
                                name="coupon"
                                placeholder="coupon"
                                className="h-7 w-20 rounded-md border bg-background px-2 text-xs"
                                required
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7"
                                type="submit"
                              >
                                Apply
                              </Button>
                            </form>
                            <form action={issueRefund} className="flex gap-1.5">
                              <input
                                type="hidden"
                                name="workspaceId"
                                value={sub.workspaceId}
                              />
                              <input
                                name="amountCents"
                                type="number"
                                min={0}
                                step="1"
                                placeholder="$"
                                className="h-7 w-20 rounded-md border bg-background px-2 text-xs"
                                required
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7"
                                type="submit"
                              >
                                Refund
                              </Button>
                            </form>
                            <form
                              action={setUsageCredits}
                              className="flex gap-1.5"
                            >
                              <input
                                type="hidden"
                                name="workspaceId"
                                value={sub.workspaceId}
                              />
                              <input
                                name="creditsCents"
                                type="number"
                                min={0}
                                step="100"
                                defaultValue={sub.usageCreditsCents}
                                className="h-7 w-24 rounded-md border bg-background px-2 text-xs"
                                required
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7"
                                type="submit"
                              >
                                Credits
                              </Button>
                            </form>
                            <form action={setHardCap} className="flex gap-1.5">
                              <input
                                type="hidden"
                                name="workspaceId"
                                value={sub.workspaceId}
                              />
                              <input
                                name="monthlyBudgetCents"
                                type="number"
                                min={0}
                                step="100"
                                defaultValue={sub.monthlyBudgetCents}
                                className="h-7 w-24 rounded-md border bg-background px-2 text-xs"
                                required
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7"
                                type="submit"
                              >
                                Hard cap
                              </Button>
                            </form>
                            <div className="flex flex-wrap gap-1.5">
                              <form action={pauseSubscription}>
                                <input
                                  type="hidden"
                                  name="workspaceId"
                                  value={sub.workspaceId}
                                />
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7"
                                  type="submit"
                                  disabled={sub.status === 'canceled'}
                                >
                                  Pause
                                </Button>
                              </form>
                              <form action={cancelSubscription}>
                                <input
                                  type="hidden"
                                  name="workspaceId"
                                  value={sub.workspaceId}
                                />
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="h-7"
                                  type="submit"
                                  disabled={sub.status === 'canceled'}
                                >
                                  Cancel
                                </Button>
                              </form>
                              <form action={viewInvoices}>
                                <input
                                  type="hidden"
                                  name="workspaceId"
                                  value={sub.workspaceId}
                                />
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7"
                                  type="submit"
                                >
                                  Invoices
                                </Button>
                              </form>
                            </div>
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
      </section>
    </div>
  )
}
