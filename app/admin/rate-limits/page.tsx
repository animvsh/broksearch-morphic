import { getRateLimitEventsForAdmin } from '@/lib/actions/admin-brok'
import { requirePageAuth } from '@/lib/auth/require-page-auth'

import { Badge } from '@/components/ui/badge'

export const dynamic = 'force-dynamic'

export default async function AdminRateLimitsPage() {
  await requirePageAuth('/admin/rate-limits')
  const events = await getRateLimitEventsForAdmin()
  const blocked = events.filter(event => event.blocked).length
  const allowed = events.length - blocked

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Rate Limits</h1>
        <p className="text-muted-foreground">
          Recent API limit checks, blocked requests, and noisy keys.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Recent checks</p>
          <p className="text-2xl font-bold">{events.length}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Allowed</p>
          <p className="text-2xl font-bold">{allowed}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Blocked</p>
          <p className="text-2xl font-bold">{blocked}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-4 text-left font-medium">Time</th>
                <th className="p-4 text-left font-medium">Workspace</th>
                <th className="p-4 text-left font-medium">API Key</th>
                <th className="p-4 text-left font-medium">Type</th>
                <th className="p-4 text-left font-medium">Current</th>
                <th className="p-4 text-left font-medium">Limit</th>
                <th className="p-4 text-left font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr>
                  <td
                    className="p-4 text-center text-muted-foreground"
                    colSpan={7}
                  >
                    No rate-limit events yet
                  </td>
                </tr>
              ) : (
                events.map(event => (
                  <tr key={event.id} className="border-b">
                    <td className="p-4">
                      {new Date(event.createdAt).toLocaleString()}
                    </td>
                    <td className="p-4">{event.workspaceName}</td>
                    <td className="p-4">
                      <p className="font-medium">{event.apiKeyName}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {event.keyPrefix ?? 'unknown'}
                      </p>
                    </td>
                    <td className="p-4">
                      <Badge variant="outline">{event.limitType}</Badge>
                    </td>
                    <td className="p-4">{event.currentValue}</td>
                    <td className="p-4">{event.limitValue}</td>
                    <td className="p-4">
                      <Badge
                        variant={event.blocked ? 'destructive' : 'secondary'}
                      >
                        {event.blocked ? 'blocked' : 'allowed'}
                      </Badge>
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
