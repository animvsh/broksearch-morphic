import Link from 'next/link'

import { getAllUsersForAdmin } from '@/lib/actions/admin-users-workspaces'
import { requirePageAuth } from '@/lib/auth/require-page-auth'

import { Badge } from '@/components/ui/badge'

export const dynamic = 'force-dynamic'

const PLAN_VARIANTS: Record<
  string,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  free: 'outline',
  starter: 'secondary',
  pro: 'default',
  team: 'default',
  scale: 'default',
  enterprise: 'default'
}

const STATUS_VARIANTS: Record<
  string,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  active: 'default',
  paused: 'secondary',
  suspended: 'destructive'
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value > 10 ? 2 : 4,
    maximumFractionDigits: value > 10 ? 2 : 4
  }).format(value)
}

function formatDateTime(value: Date | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value))
}

function riskBadgeVariant(score: number) {
  if (score >= 70) return 'destructive' as const
  if (score >= 40) return 'secondary' as const
  return 'outline' as const
}

export default async function AdminUsersPage() {
  await requirePageAuth('/admin/users')
  const users = await getAllUsersForAdmin()

  return (
    <div className="space-y-6 px-4 pb-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">Users</h1>
        <p className="text-muted-foreground">
          Every user known to Brok — derived from API keys, usage events, and
          workspace ownership. Click a row to manage a single user.
        </p>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1500px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">User</th>
                <th className="px-3 py-2 text-left font-medium">Email</th>
                <th className="px-3 py-2 text-left font-medium">Plan</th>
                <th className="px-3 py-2 text-left font-medium">Workspace</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">
                  Searches Today
                </th>
                <th className="px-3 py-2 text-right font-medium">
                  Apps Generated
                </th>
                <th className="px-3 py-2 text-right font-medium">Decks</th>
                <th className="px-3 py-2 text-right font-medium">API Calls</th>
                <th className="px-3 py-2 text-right font-medium">Cost Today</th>
                <th className="px-3 py-2 text-right font-medium">
                  Revenue Today
                </th>
                <th className="px-3 py-2 text-right font-medium">Margin</th>
                <th className="px-3 py-2 text-right font-medium">Risk</th>
                <th className="px-3 py-2 text-left font-medium">Last Active</th>
                <th className="px-3 py-2 text-left font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td
                    colSpan={15}
                    className="px-3 py-12 text-center text-muted-foreground"
                  >
                    No users yet — wait for signups, API key creation, or
                    workspace activity to populate this list.
                  </td>
                </tr>
              ) : (
                users.map(user => {
                  const margin =
                    user.revenueToday > 0
                      ? (1 - user.costToday / user.revenueToday) * 100
                      : 0
                  return (
                    <tr
                      key={user.id}
                      className="cursor-pointer border-b last:border-0 transition-colors hover:bg-muted/40"
                    >
                      <td className="px-3 py-2">
                        <Link
                          href={`/admin/users/${user.id}`}
                          className="inline-flex min-h-11 min-w-11 items-center rounded-md px-2 font-mono text-xs text-primary hover:underline"
                        >
                          {user.id.slice(0, 14)}…
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        {user.email ?? (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          variant={
                            PLAN_VARIANTS[user.plan ?? 'free'] ?? 'outline'
                          }
                        >
                          {user.plan ?? 'free'}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        {user.workspaceId ? (
                          <Link
                            href={`/admin/workspaces/${user.workspaceId}`}
                            className="inline-flex min-h-11 min-w-11 items-center rounded-md px-2 text-primary hover:underline"
                          >
                            {user.workspaceName ?? 'Workspace'}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          variant={STATUS_VARIANTS[user.status] ?? 'outline'}
                        >
                          {user.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {user.searchesToday.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {user.appsGenerated.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {user.presentationsCreated.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {user.apiCallsToday.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatCurrency(user.costToday)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatCurrency(user.revenueToday)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {user.revenueToday > 0 ? `${margin.toFixed(1)}%` : '—'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Badge variant={riskBadgeVariant(user.riskScore)}>
                          {user.riskScore}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {formatDateTime(user.lastActiveAt)}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {formatDateTime(user.createdAt)}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
