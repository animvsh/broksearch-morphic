import Link from 'next/link'
import { notFound } from 'next/navigation'

import {
  changeWorkspacePlanForAdmin,
  getWorkspaceDetailForAdmin,
  pauseWorkspaceForAdmin,
  resumeWorkspaceForAdmin,
  setWorkspaceRateLimitsForAdmin
} from '@/lib/actions/admin-users-workspaces'
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
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export const dynamic = 'force-dynamic'

const PLAN_OPTIONS = ['free', 'starter', 'pro', 'team', 'scale', 'enterprise']

const STATUS_VARIANT: Record<
  string,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  active: 'default',
  paused: 'secondary',
  suspended: 'destructive',
  trial: 'outline'
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

function formatDateTime(value: Date | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value))
}

function StatTile({
  label,
  value,
  detail
}: {
  label: string
  value: string
  detail?: string
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {detail ? (
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      ) : null}
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <p className="rounded-md border border-dashed bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
      {label}
    </p>
  )
}

function StatusBadge({ status }: { status: string }) {
  return <Badge variant={STATUS_VARIANT[status] ?? 'outline'}>{status}</Badge>
}

export default async function AdminWorkspaceDetailPage({
  params
}: {
  params: Promise<{ workspaceId: string }>
}) {
  await requirePageAuth('/admin/workspaces')
  const { workspaceId } = await params
  const workspace = await getWorkspaceDetailForAdmin(workspaceId)

  if (!workspace) {
    notFound()
  }

  const margin =
    workspace.totals.revenue > 0
      ? (1 - workspace.totals.cost / workspace.totals.revenue) * 100
      : 0
  const maxDay = Math.max(1, ...workspace.usageRows.map(row => row.requests))

  return (
    <div className="space-y-6 px-4 pb-12 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{workspace.name}</h1>
            <StatusBadge status={workspace.status} />
            <Badge variant="outline">{workspace.plan}</Badge>
          </div>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {workspace.id}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Owner:{' '}
            {workspace.ownerEmail ? (
              <Link
                href={`/admin/users/${workspace.ownerUserId}`}
                className="text-primary hover:underline"
              >
                {workspace.ownerEmail}
              </Link>
            ) : (
              <span className="font-mono text-xs">
                {workspace.ownerUserId.slice(0, 14)}…
              </span>
            )}
            <span className="ml-2 text-muted-foreground">
              · Created {formatDate(workspace.createdAt)}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {workspace.status === 'active' ? (
            <form action={pauseWorkspaceForAdmin}>
              <input type="hidden" name="workspaceId" value={workspace.id} />
              <Button type="submit" variant="outline" size="sm">
                Pause workspace
              </Button>
            </form>
          ) : (
            <form action={resumeWorkspaceForAdmin}>
              <input type="hidden" name="workspaceId" value={workspace.id} />
              <Button type="submit" size="sm">
                Resume workspace
              </Button>
            </form>
          )}
        </div>
      </div>

      <Tabs defaultValue="members" className="space-y-6">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="projects">Projects</TabsTrigger>
          <TabsTrigger value="presentations">Presentations</TabsTrigger>
          <TabsTrigger value="api-keys">API Keys</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="costs">Costs</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="rate-limits">Rate Limits</TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Members</CardTitle>
              <CardDescription>
                Users with API keys in this workspace. Owner is always listed
                first.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {workspace.members.length === 0 ? (
                <EmptyState label="No members yet" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="py-2 pr-3 text-left font-medium">
                          User
                        </th>
                        <th className="py-2 pr-3 text-left font-medium">
                          Email
                        </th>
                        <th className="py-2 pr-3 text-right font-medium">
                          API Keys
                        </th>
                        <th className="py-2 text-left font-medium">
                          Last used
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {workspace.members.map(member => (
                        <tr
                          key={member.userId}
                          className="border-b last:border-0"
                        >
                          <td className="py-2 pr-3">
                            <Link
                              href={`/admin/users/${member.userId}`}
                              className="font-mono text-xs text-primary hover:underline"
                            >
                              {member.userId.slice(0, 14)}…
                            </Link>
                          </td>
                          <td className="py-2 pr-3">
                            {member.email ?? (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-2 pr-3 text-right">
                            {member.apiKeyCount}
                          </td>
                          <td className="py-2 text-muted-foreground">
                            {formatDateTime(member.lastUsedAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="projects" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>App Projects</CardTitle>
              <CardDescription>
                BrokCode / Brok Build projects in this workspace.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {workspace.projects.length === 0 ? (
                <EmptyState label="No app projects yet" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="py-2 pr-3 text-left font-medium">
                          Name
                        </th>
                        <th className="py-2 pr-3 text-left font-medium">
                          Slug
                        </th>
                        <th className="py-2 pr-3 text-left font-medium">
                          Status
                        </th>
                        <th className="py-2 pr-3 text-left font-medium">
                          Owner
                        </th>
                        <th className="py-2 text-left font-medium">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workspace.projects.map(project => (
                        <tr key={project.id} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-medium">
                            {project.name}
                          </td>
                          <td className="py-2 pr-3 font-mono text-xs">
                            {project.slug}
                          </td>
                          <td className="py-2 pr-3">
                            <Badge variant="outline">{project.status}</Badge>
                          </td>
                          <td className="py-2 pr-3">
                            <Link
                              href={`/admin/users/${project.userId}`}
                              className="font-mono text-xs text-primary hover:underline"
                            >
                              {project.userId.slice(0, 14)}…
                            </Link>
                          </td>
                          <td className="py-2 text-muted-foreground">
                            {formatDate(project.createdAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="presentations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Presentations</CardTitle>
              <CardDescription>
                Decks created in this workspace.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {workspace.presentations.length === 0 ? (
                <EmptyState label="No presentations yet" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="py-2 pr-3 text-left font-medium">
                          Title
                        </th>
                        <th className="py-2 pr-3 text-left font-medium">
                          Status
                        </th>
                        <th className="py-2 pr-3 text-left font-medium">
                          Owner
                        </th>
                        <th className="py-2 text-left font-medium">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workspace.presentations.map(deck => (
                        <tr key={deck.id} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-medium">
                            {deck.title}
                          </td>
                          <td className="py-2 pr-3">
                            <Badge variant="outline">{deck.status}</Badge>
                          </td>
                          <td className="py-2 pr-3">
                            <Link
                              href={`/admin/users/${deck.userId}`}
                              className="font-mono text-xs text-primary hover:underline"
                            >
                              {deck.userId.slice(0, 14)}…
                            </Link>
                          </td>
                          <td className="py-2 text-muted-foreground">
                            {formatDate(deck.createdAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api-keys" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>API Keys</CardTitle>
              <CardDescription>Every key in this workspace.</CardDescription>
            </CardHeader>
            <CardContent>
              {workspace.apiKeys.length === 0 ? (
                <EmptyState label="No API keys yet" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="py-2 pr-3 text-left font-medium">
                          Name
                        </th>
                        <th className="py-2 pr-3 text-left font-medium">
                          Prefix
                        </th>
                        <th className="py-2 pr-3 text-left font-medium">Env</th>
                        <th className="py-2 pr-3 text-left font-medium">
                          Status
                        </th>
                        <th className="py-2 pr-3 text-right font-medium">
                          RPM
                        </th>
                        <th className="py-2 pr-3 text-right font-medium">
                          Daily
                        </th>
                        <th className="py-2 pr-3 text-right font-medium">
                          Budget
                        </th>
                        <th className="py-2 text-left font-medium">
                          Last used
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {workspace.apiKeys.map(key => (
                        <tr key={key.id} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-medium">{key.name}</td>
                          <td className="py-2 pr-3 font-mono text-xs">
                            {key.keyPrefix}••••
                          </td>
                          <td className="py-2 pr-3">{key.environment}</td>
                          <td className="py-2 pr-3">
                            <StatusBadge status={key.status} />
                          </td>
                          <td className="py-2 pr-3 text-right">
                            {key.rpmLimit ?? '∞'}
                          </td>
                          <td className="py-2 pr-3 text-right">
                            {key.dailyRequestLimit?.toLocaleString() ?? '∞'}
                          </td>
                          <td className="py-2 pr-3 text-right">
                            {key.monthlyBudgetCents
                              ? `$${(key.monthlyBudgetCents / 100).toFixed(2)}`
                              : '—'}
                          </td>
                          <td className="py-2 text-muted-foreground">
                            {formatDateTime(key.lastUsedAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="usage" className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile
              label="API Calls (30d)"
              value={workspace.usageRows
                .reduce((sum, row) => sum + row.requests, 0)
                .toLocaleString()}
            />
            <StatTile
              label="Cost (30d)"
              value={formatCurrency(
                workspace.usageRows.reduce((sum, row) => sum + row.cost, 0)
              )}
            />
            <StatTile
              label="Billed (30d)"
              value={formatCurrency(
                workspace.usageRows.reduce((sum, row) => sum + row.billed, 0)
              )}
            />
            <StatTile
              label="Total Cost"
              value={formatCurrency(workspace.totals.cost)}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Daily Usage (30 days)</CardTitle>
            </CardHeader>
            <CardContent>
              {workspace.usageRows.length === 0 ? (
                <EmptyState label="No usage in the last 30 days" />
              ) : (
                <div className="flex h-48 items-end gap-1 rounded-md border bg-muted/20 px-3 pb-6 pt-2">
                  {workspace.usageRows.map(row => {
                    const height = Math.max(
                      (row.requests / maxDay) * 100,
                      row.requests > 0 ? 4 : 1
                    )
                    return (
                      <div
                        key={row.day}
                        className="group relative flex min-w-0 flex-1 flex-col items-center justify-end"
                      >
                        <div
                          className="w-full rounded-t-sm bg-primary/85 transition-colors group-hover:bg-primary"
                          style={{ height: `${height}%` }}
                        />
                        <span className="pointer-events-none absolute -bottom-5 hidden whitespace-nowrap text-[10px] text-muted-foreground group-hover:block">
                          {row.day.slice(5)} · {row.requests}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="costs" className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile
              label="Total Cost"
              value={formatCurrency(workspace.totals.cost)}
            />
            <StatTile
              label="Total Revenue"
              value={formatCurrency(workspace.totals.revenue)}
            />
            <StatTile
              label="Margin"
              value={
                workspace.totals.revenue > 0 ? `${margin.toFixed(1)}%` : '—'
              }
            />
            <StatTile
              label="API Calls"
              value={workspace.totals.requests.toLocaleString()}
            />
          </div>
        </TabsContent>

        <TabsContent value="billing" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Plan &amp; Rate Limits</CardTitle>
              <CardDescription>
                Update the workspace plan and override the default RPM, daily,
                and budget limits for its API keys.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                action={changeWorkspacePlanForAdmin}
                className="mb-6 flex flex-wrap items-end gap-3"
              >
                <input type="hidden" name="workspaceId" value={workspace.id} />
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Plan
                  </label>
                  <select
                    name="plan"
                    defaultValue={workspace.plan}
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                  >
                    {PLAN_OPTIONS.map(plan => (
                      <option key={plan} value={plan}>
                        {plan}
                      </option>
                    ))}
                  </select>
                </div>
                <Button type="submit">Save plan</Button>
              </form>

              <form
                action={setWorkspaceRateLimitsForAdmin}
                className="grid gap-3 sm:grid-cols-4"
              >
                <input type="hidden" name="workspaceId" value={workspace.id} />
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    RPM limit
                  </label>
                  <Input
                    name="rpmLimit"
                    type="number"
                    min={1}
                    defaultValue={workspace.apiKeys[0]?.rpmLimit ?? 60}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Daily request limit
                  </label>
                  <Input
                    name="dailyRequestLimit"
                    type="number"
                    min={1}
                    defaultValue={
                      workspace.apiKeys[0]?.dailyRequestLimit ?? 5000
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Monthly budget (cents)
                  </label>
                  <Input
                    name="monthlyBudgetCents"
                    type="number"
                    min={0}
                    defaultValue={
                      workspace.monthlyBudgetCents ??
                      workspace.apiKeys[0]?.monthlyBudgetCents ??
                      0
                    }
                  />
                </div>
                <div className="flex items-end">
                  <Button type="submit" className="w-full">
                    Save limits
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Logs</CardTitle>
              <CardDescription>
                Last 50 request events in this workspace.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {workspace.logs.length === 0 ? (
                <EmptyState label="No logs yet" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="py-2 pr-3 text-left font-medium">
                          Request
                        </th>
                        <th className="py-2 pr-3 text-left font-medium">
                          Endpoint
                        </th>
                        <th className="py-2 pr-3 text-left font-medium">
                          Model
                        </th>
                        <th className="py-2 pr-3 text-left font-medium">
                          Status
                        </th>
                        <th className="py-2 pr-3 text-left font-medium">
                          Error
                        </th>
                        <th className="py-2 text-left font-medium">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workspace.logs.map(row => (
                        <tr key={row.id} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-mono text-xs">
                            {row.requestId.slice(0, 14)}…
                          </td>
                          <td className="py-2 pr-3">{row.endpoint}</td>
                          <td className="py-2 pr-3">{row.model}</td>
                          <td className="py-2 pr-3">
                            <StatusBadge status={row.status} />
                          </td>
                          <td className="py-2 pr-3 text-muted-foreground">
                            {row.errorCode ?? '—'}
                          </td>
                          <td className="py-2 text-muted-foreground">
                            {formatDateTime(row.createdAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rate-limits" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Rate Limit Events</CardTitle>
              <CardDescription>
                Recent rate-limit activity in this workspace.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {workspace.rateLimits.length === 0 ? (
                <EmptyState label="No rate-limit events" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="py-2 pr-3 text-left font-medium">
                          Type
                        </th>
                        <th className="py-2 pr-3 text-right font-medium">
                          Limit
                        </th>
                        <th className="py-2 pr-3 text-right font-medium">
                          Current
                        </th>
                        <th className="py-2 pr-3 text-left font-medium">
                          Blocked
                        </th>
                        <th className="py-2 text-left font-medium">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workspace.rateLimits.map(row => (
                        <tr key={row.id} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-medium">
                            {row.limitType}
                          </td>
                          <td className="py-2 pr-3 text-right">
                            {row.limitValue}
                          </td>
                          <td className="py-2 pr-3 text-right">
                            {row.currentValue}
                          </td>
                          <td className="py-2 pr-3">
                            {row.blocked ? (
                              <Badge variant="destructive">Blocked</Badge>
                            ) : (
                              <Badge variant="outline">Allowed</Badge>
                            )}
                          </td>
                          <td className="py-2 text-muted-foreground">
                            {formatDateTime(row.createdAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
