import Link from 'next/link'

import { getAllWorkspacesForAdmin } from '@/lib/actions/admin-users-workspaces'
import { requirePageAuth } from '@/lib/auth/require-page-auth'

import { Badge } from '@/components/ui/badge'

export const dynamic = 'force-dynamic'

const STATUS_VARIANTS: Record<
  string,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  active: 'default',
  paused: 'secondary',
  suspended: 'destructive',
  trial: 'outline'
}

const PLAN_VARIANTS: Record<string, 'default' | 'secondary' | 'outline'> = {
  free: 'outline',
  starter: 'secondary',
  pro: 'default',
  team: 'default',
  scale: 'default',
  enterprise: 'default'
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value > 10 ? 2 : 4,
    maximumFractionDigits: value > 10 ? 2 : 4
  }).format(value)
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date(value))
}

export default async function AdminWorkspacesPage() {
  await requirePageAuth('/admin/workspaces')
  const workspaces = await getAllWorkspacesForAdmin()

  return (
    <div className="space-y-6 px-4 pb-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">Workspaces</h1>
        <p className="text-muted-foreground">
          Every workspace on the platform. Click a row to manage members, API
          keys, projects, and rate limits.
        </p>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1300px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Workspace</th>
                <th className="px-3 py-2 text-left font-medium">Owner</th>
                <th className="px-3 py-2 text-right font-medium">Members</th>
                <th className="px-3 py-2 text-left font-medium">Plan</th>
                <th className="px-3 py-2 text-right font-medium">Searches</th>
                <th className="px-3 py-2 text-right font-medium">Apps</th>
                <th className="px-3 py-2 text-right font-medium">Decks</th>
                <th className="px-3 py-2 text-right font-medium">API Calls</th>
                <th className="px-3 py-2 text-right font-medium">
                  Monthly Cost
                </th>
                <th className="px-3 py-2 text-right font-medium">
                  Monthly Revenue
                </th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-left font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {workspaces.length === 0 ? (
                <tr>
                  <td
                    colSpan={12}
                    className="px-3 py-12 text-center text-muted-foreground"
                  >
                    No workspaces yet — wait for users to create accounts.
                  </td>
                </tr>
              ) : (
                workspaces.map(workspace => (
                  <tr
                    key={workspace.id}
                    className="cursor-pointer border-b last:border-0 transition-colors hover:bg-muted/40"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/workspaces/${workspace.id}`}
                        className="block font-medium hover:underline"
                      >
                        {workspace.name}
                      </Link>
                      <p className="font-mono text-xs text-muted-foreground">
                        {workspace.id.slice(0, 8)}…
                      </p>
                    </td>
                    <td className="px-3 py-2">
                      {workspace.ownerEmail ?? (
                        <span className="font-mono text-xs text-muted-foreground">
                          {workspace.ownerUserId.slice(0, 14)}…
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {workspace.memberCount}
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        variant={PLAN_VARIANTS[workspace.plan] ?? 'outline'}
                      >
                        {workspace.plan}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {workspace.searches.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {workspace.apps.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {workspace.presentations.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {workspace.apiCalls.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatCurrency(workspace.monthlyCost)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatCurrency(workspace.monthlyRevenue)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        variant={STATUS_VARIANTS[workspace.status] ?? 'outline'}
                      >
                        {workspace.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {formatDate(workspace.createdAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
