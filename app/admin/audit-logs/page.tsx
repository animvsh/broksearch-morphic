import {
  getAdminAuditLogCount,
  getAdminAuditLogs
} from '@/lib/actions/admin-audit'
import { requirePageAuth } from '@/lib/auth/require-page-auth'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

const ACTION_LABELS: Record<string, { label: string; tone: string }> = {
  'api_key.paused': { label: 'API key paused', tone: 'default' },
  'api_key.resumed': { label: 'API key resumed', tone: 'secondary' },
  'api_key.revoked': { label: 'API key revoked', tone: 'destructive' },
  'api_key.rate_limit_changed': {
    label: 'API key rate limit changed',
    tone: 'default'
  },
  'api_key.scopes_changed': {
    label: 'API key scopes changed',
    tone: 'default'
  },
  'presentation.deleted': {
    label: 'Presentation deleted',
    tone: 'destructive'
  },
  'presentation.share_disabled': {
    label: 'Public share disabled',
    tone: 'destructive'
  },
  'user.suspended': { label: 'User suspended', tone: 'destructive' },
  'user.unsuspended': { label: 'User reactivated', tone: 'secondary' },
  'user.role_changed': { label: 'User role changed', tone: 'default' },
  'provider.route_changed': {
    label: 'Provider route changed',
    tone: 'default'
  },
  'provider.kill_switch_toggled': {
    label: 'Provider kill switch toggled',
    tone: 'destructive'
  },
  'provider.model_toggled': {
    label: 'Provider model toggled',
    tone: 'default'
  },
  'rate_limit.changed': { label: 'Rate limit changed', tone: 'default' },
  'refund.issued': { label: 'Refund issued', tone: 'default' },
  'allowlist.added': { label: 'Allowlist added', tone: 'secondary' },
  'allowlist.removed': { label: 'Allowlist removed', tone: 'destructive' },
  'allowlist.features_updated': {
    label: 'Allowlist features updated',
    tone: 'default'
  }
}

function describeAction(action: string): { label: string; tone: string } {
  return ACTION_LABELS[action] ?? { label: action, tone: 'outline' }
}

function formatDateTime(value: Date | null | undefined) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date(value))
}

function summarizeChange(value: Record<string, unknown> | null) {
  if (!value) return null
  const entries = Object.entries(value)
  if (entries.length === 0) return null
  return entries
    .slice(0, 4)
    .map(([key, val]) => {
      const display =
        typeof val === 'string' || typeof val === 'number'
          ? String(val)
          : JSON.stringify(val)
      return `${key}=${display}`
    })
    .join(' · ')
}

export default async function AdminAuditLogsPage({
  searchParams
}: {
  searchParams: Promise<{
    action?: string
    target?: string
    q?: string
  }>
}) {
  await requirePageAuth('/admin/audit-logs')

  const params = await searchParams
  const [logs, total] = await Promise.all([
    getAdminAuditLogs({
      action: params.action,
      targetType: params.target,
      query: params.q
    }),
    getAdminAuditLogCount()
  ])

  return (
    <div className="space-y-6 px-4 pb-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Admin Audit Logs</h1>
          <p className="text-muted-foreground">
            Every privileged admin action is recorded here. Total entries
            logged: {total.toLocaleString()}.
          </p>
        </div>
        <form className="flex flex-wrap gap-2" method="get">
          <input
            type="text"
            name="q"
            placeholder="Search action, target, admin"
            defaultValue={params.q ?? ''}
            className="h-9 w-56 rounded-md border bg-background px-3 text-sm"
          />
          <input
            type="text"
            name="action"
            placeholder="api_key.paused"
            defaultValue={params.action ?? ''}
            className="h-9 w-56 rounded-md border bg-background px-3 text-sm"
          />
          <input
            type="text"
            name="target"
            placeholder="Target type (api_key, user, …)"
            defaultValue={params.target ?? ''}
            className="h-9 w-56 rounded-md border bg-background px-3 text-sm"
          />
          <button
            type="submit"
            className="h-9 rounded-md border bg-foreground px-3 text-sm font-medium text-background hover:opacity-90"
          >
            Apply
          </button>
        </form>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Admin Actions</CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No audit log entries match the current filters.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="py-2 pr-4 text-left font-medium">Time</th>
                    <th className="py-2 pr-4 text-left font-medium">Admin</th>
                    <th className="py-2 pr-4 text-left font-medium">Action</th>
                    <th className="py-2 pr-4 text-left font-medium">Target</th>
                    <th className="py-2 pr-4 text-left font-medium">
                      Before / After
                    </th>
                    <th className="py-2 pr-4 text-left font-medium">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(entry => {
                    const { label, tone } = describeAction(entry.action)
                    const before = summarizeChange(entry.beforeValue)
                    const after = summarizeChange(entry.afterValue)
                    return (
                      <tr
                        key={entry.id}
                        className="border-b last:border-b-0 align-top"
                      >
                        <td className="py-3 pr-4 text-xs text-muted-foreground">
                          {formatDateTime(entry.createdAt)}
                        </td>
                        <td className="py-3 pr-4">
                          <p className="font-medium">
                            {entry.adminEmail ?? entry.adminUserId ?? 'system'}
                          </p>
                          {entry.adminUserId ? (
                            <p className="text-xs text-muted-foreground">
                              {entry.adminUserId}
                            </p>
                          ) : null}
                        </td>
                        <td className="py-3 pr-4">
                          <Badge
                            variant={
                              tone === 'destructive'
                                ? 'destructive'
                                : tone === 'default'
                                  ? 'default'
                                  : 'secondary'
                            }
                          >
                            {label}
                          </Badge>
                        </td>
                        <td className="py-3 pr-4">
                          <p className="font-medium">{entry.targetType}</p>
                          {entry.targetId ? (
                            <p className="font-mono text-xs text-muted-foreground">
                              {entry.targetId}
                            </p>
                          ) : null}
                        </td>
                        <td className="py-3 pr-4 text-xs text-muted-foreground">
                          {before ? (
                            <p>
                              <span className="font-medium text-foreground/80">
                                Before:
                              </span>{' '}
                              {before}
                            </p>
                          ) : null}
                          {after ? (
                            <p>
                              <span className="font-medium text-foreground/80">
                                After:
                              </span>{' '}
                              {after}
                            </p>
                          ) : null}
                        </td>
                        <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">
                          {entry.ipAddress ?? '-'}
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
    </div>
  )
}
