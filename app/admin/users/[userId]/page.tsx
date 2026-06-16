import Link from 'next/link'
import { notFound } from 'next/navigation'

import {
  changeUserPlanForAdmin,
  deleteUserForAdmin,
  getUserDetailForAdmin,
  markUserTrustedForAdmin,
  pauseUserForAdmin,
  refundUserForAdmin,
  resumeUserForAdmin,
  setUserCustomLimitsForAdmin
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

const STATUS_VARIANT: Record<
  string,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  active: 'default',
  paused: 'secondary',
  suspended: 'destructive'
}

const PLAN_OPTIONS = ['free', 'starter', 'pro', 'team', 'scale', 'enterprise']

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

export default async function AdminUserDetailPage({
  params
}: {
  params: Promise<{ userId: string }>
}) {
  await requirePageAuth('/admin/users')
  const { userId } = await params
  const user = await getUserDetailForAdmin(userId)

  if (!user) {
    notFound()
  }

  const margin =
    user.totals.revenueTotal > 0
      ? (1 - user.totals.costTotal / user.totals.revenueTotal) * 100
      : 0

  return (
    <div className="space-y-6 px-4 pb-12 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">
              {user.email ?? 'Unknown user'}
            </h1>
            <StatusBadge status={user.status} />
            <Badge variant="outline">{user.plan}</Badge>
          </div>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {user.id}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {user.workspaceId ? (
              <>
                Workspace:{' '}
                <Link
                  href={`/admin/workspaces/${user.workspaceId}`}
                  className="text-primary hover:underline"
                >
                  {user.workspaceName ?? 'Unknown workspace'}
                </Link>
              </>
            ) : (
              'No workspace yet'
            )}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {user.status === 'active' ? (
            <form action={pauseUserForAdmin}>
              <input type="hidden" name="userId" value={user.id} />
              <Button type="submit" variant="outline" size="sm">
                Pause
              </Button>
            </form>
          ) : (
            <form action={resumeUserForAdmin}>
              <input type="hidden" name="userId" value={user.id} />
              <Button type="submit" size="sm">
                Resume
              </Button>
            </form>
          )}
          <form action={refundUserForAdmin}>
            <input type="hidden" name="userId" value={user.id} />
            <Button type="submit" variant="outline" size="sm">
              Refund
            </Button>
          </form>
          <form action={markUserTrustedForAdmin}>
            <input type="hidden" name="userId" value={user.id} />
            <Button type="submit" variant="outline" size="sm">
              Mark Trusted
            </Button>
          </form>
          <form action={deleteUserForAdmin}>
            <input type="hidden" name="userId" value={user.id} />
            <Button type="submit" variant="destructive" size="sm">
              Delete
            </Button>
          </form>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="searches">Searches</TabsTrigger>
          <TabsTrigger value="projects">App Projects</TabsTrigger>
          <TabsTrigger value="presentations">Presentations</TabsTrigger>
          <TabsTrigger value="api-keys">API Keys</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="costs">Costs</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="abuse">Abuse</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile
              label="Total API Calls"
              value={user.totals.apiCalls.toLocaleString()}
            />
            <StatTile
              label="Searches"
              value={user.totals.searches.toLocaleString()}
            />
            <StatTile
              label="Apps Generated"
              value={user.totals.appsGenerated.toLocaleString()}
            />
            <StatTile
              label="Presentations"
              value={user.totals.presentationsCreated.toLocaleString()}
            />
            <StatTile
              label="Cost Today"
              value={formatCurrency(user.totals.costToday)}
            />
            <StatTile
              label="Revenue Today"
              value={formatCurrency(user.totals.revenueToday)}
            />
            <StatTile
              label="Total Cost"
              value={formatCurrency(user.totals.costTotal)}
            />
            <StatTile
              label="Total Revenue"
              value={formatCurrency(user.totals.revenueTotal)}
              detail={
                user.totals.revenueTotal > 0
                  ? `${margin.toFixed(1)}% margin`
                  : undefined
              }
            />
            <StatTile
              label="Failed Requests"
              value={user.failedRequests.toLocaleString()}
            />
            <StatTile
              label="Rate Limited"
              value={user.rateLimitedRequests.toLocaleString()}
            />
            <StatTile
              label="Last Active"
              value={formatDateTime(user.lastActiveAt)}
            />
            <StatTile
              label="First Seen"
              value={formatDateTime(user.createdAt)}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Custom Limits</CardTitle>
              <CardDescription>
                Override the workspace defaults for this user&apos;s API keys.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                action={setUserCustomLimitsForAdmin}
                className="grid gap-3 sm:grid-cols-4"
              >
                <input type="hidden" name="userId" value={user.id} />
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    RPM limit
                  </label>
                  <Input
                    name="rpmLimit"
                    type="number"
                    min={1}
                    defaultValue={user.customLimits.rpmLimit ?? 60}
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
                    defaultValue={user.customLimits.dailyRequestLimit ?? 5000}
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
                    defaultValue={user.customLimits.monthlyBudgetCents ?? 0}
                  />
                </div>
                <div className="flex items-end">
                  <Button type="submit" className="w-full">
                    Save Limits
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="usage" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Usage</CardTitle>
              <CardDescription>
                Last 50 events from this user across all endpoints.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {user.recentUsage.length === 0 ? (
                <EmptyState label="No usage events yet" />
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
                        <th className="py-2 pr-3 text-right font-medium">
                          Cost
                        </th>
                        <th className="py-2 text-left font-medium">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {user.recentUsage.map(row => (
                        <tr key={row.id} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-mono text-xs">
                            {row.requestId.slice(0, 14)}…
                          </td>
                          <td className="py-2 pr-3">{row.endpoint}</td>
                          <td className="py-2 pr-3">{row.model}</td>
                          <td className="py-2 pr-3">
                            <StatusBadge status={row.status} />
                          </td>
                          <td className="py-2 pr-3 text-right">
                            {formatCurrency(row.cost)}
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

        <TabsContent value="searches" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Searches</CardTitle>
              <CardDescription>
                Recent /v1/search requests for this user.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {user.recentSearches.length === 0 ? (
                <EmptyState label="No search events yet" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="py-2 pr-3 text-left font-medium">
                          Request
                        </th>
                        <th className="py-2 pr-3 text-left font-medium">
                          Model
                        </th>
                        <th className="py-2 pr-3 text-left font-medium">
                          Status
                        </th>
                        <th className="py-2 text-left font-medium">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {user.recentSearches.map(row => (
                        <tr key={row.id} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-mono text-xs">
                            {row.requestId.slice(0, 14)}…
                          </td>
                          <td className="py-2 pr-3">{row.model}</td>
                          <td className="py-2 pr-3">
                            <StatusBadge status={row.status} />
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

        <TabsContent value="projects" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>App Projects</CardTitle>
              <CardDescription>
                Generated apps owned by this user.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {user.appProjects.length === 0 ? (
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
                        <th className="py-2 text-left font-medium">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {user.appProjects.map(project => (
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
                          <td className="py-2 text-muted-foreground">
                            {formatDateTime(project.createdAt)}
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
                Decks generated in the user&apos;s workspace.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {user.presentations.length === 0 ? (
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
                        <th className="py-2 text-left font-medium">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {user.presentations.map(deck => (
                        <tr key={deck.id} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-medium">
                            {deck.title}
                          </td>
                          <td className="py-2 pr-3">
                            <Badge variant="outline">{deck.status}</Badge>
                          </td>
                          <td className="py-2 text-muted-foreground">
                            {formatDateTime(deck.createdAt)}
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
              <CardDescription>
                All API keys issued to this user.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {user.apiKeys.length === 0 ? (
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
                        <th className="py-2 text-left font-medium">
                          Last used
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {user.apiKeys.map(key => (
                        <tr key={key.id} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-medium">{key.name}</td>
                          <td className="py-2 pr-3 font-mono text-xs">
                            {key.keyPrefix}••••
                          </td>
                          <td className="py-2 pr-3">{key.environment}</td>
                          <td className="py-2 pr-3">
                            <StatusBadge status={key.status} />
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

        <TabsContent value="logs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>All Logs</CardTitle>
              <CardDescription>
                The 50 most recent request logs for this user.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {user.recentUsage.length === 0 ? (
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
                        <th className="py-2 text-left font-medium">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {user.recentUsage.map(row => (
                        <tr key={row.id} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-mono text-xs">
                            {row.requestId}
                          </td>
                          <td className="py-2 pr-3">{row.endpoint}</td>
                          <td className="py-2 pr-3">{row.model}</td>
                          <td className="py-2 pr-3">
                            <StatusBadge status={row.status} />
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

        <TabsContent value="costs" className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile
              label="Cost Today"
              value={formatCurrency(user.totals.costToday)}
            />
            <StatTile
              label="Revenue Today"
              value={formatCurrency(user.totals.revenueToday)}
            />
            <StatTile
              label="Total Cost"
              value={formatCurrency(user.totals.costTotal)}
            />
            <StatTile
              label="Total Revenue"
              value={formatCurrency(user.totals.revenueTotal)}
            />
          </div>
          {user.totals.revenueTotal > 0 ? (
            <p className="text-sm text-muted-foreground">
              Lifetime margin: {margin.toFixed(1)}%
            </p>
          ) : null}
        </TabsContent>

        <TabsContent value="billing" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Plan &amp; Billing</CardTitle>
              <CardDescription>
                Change the user&apos;s plan. Billing automation is wired through
                the workspace owner.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                action={changeUserPlanForAdmin}
                className="flex flex-wrap items-end gap-3"
              >
                <input type="hidden" name="userId" value={user.id} />
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Plan
                  </label>
                  <select
                    name="plan"
                    defaultValue={user.plan}
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                  >
                    {PLAN_OPTIONS.map(plan => (
                      <option key={plan} value={plan}>
                        {plan}
                      </option>
                    ))}
                  </select>
                </div>
                <Button type="submit">Update plan</Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="abuse" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Rate Limit Events</CardTitle>
              <CardDescription>
                Recent rate-limit hits and abuse signals.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {user.abuse.length === 0 ? (
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
                      {user.abuse.map(row => (
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

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Account Settings</CardTitle>
              <CardDescription>
                Administrative overrides and dangerous actions.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">User ID</dt>
                  <dd className="mt-1 break-all font-mono text-xs">
                    {user.id}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Email</dt>
                  <dd className="mt-1">{user.email ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Status</dt>
                  <dd className="mt-1">
                    <StatusBadge status={user.status} />
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Plan</dt>
                  <dd className="mt-1">
                    <Badge variant="outline">{user.plan}</Badge>
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Workspace</dt>
                  <dd className="mt-1">{user.workspaceName ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Last active</dt>
                  <dd className="mt-1">{formatDateTime(user.lastActiveAt)}</dd>
                </div>
              </dl>
              <form action={deleteUserForAdmin}>
                <input type="hidden" name="userId" value={user.id} />
                <Button type="submit" variant="destructive" size="sm">
                  Delete user &amp; workspace
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
