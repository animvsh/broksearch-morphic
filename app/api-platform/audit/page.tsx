import { redirect } from 'next/navigation'

import { History, ShieldCheck } from 'lucide-react'

import {
  ensureWorkspaceForUser,
  listApiKeyAuditEvents
} from '@/lib/actions/api-keys'
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

function formatDate(value: Date | string | null) {
  if (!value) return 'Never'
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

function formatEventType(value: string) {
  return value
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatMetadata(metadata: Record<string, unknown> | null) {
  if (!metadata || Object.keys(metadata).length === 0) {
    return '—'
  }

  return Object.entries(metadata)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(', ')
}

export default async function ApiKeyAuditPage() {
  const user = await requireFeatureAccess('/api-platform/audit', 'api_platform')
  if (!user) {
    redirect(
      `/auth/login?redirectTo=${encodeURIComponent('/api-platform/audit')}`
    )
  }

  const workspace = await ensureWorkspaceForUser(user.id)
  const events = await listApiKeyAuditEvents(workspace.id, 100)

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden rounded-xl shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="size-5" />
            Key Lifecycle Audit
          </CardTitle>
          <CardDescription>
            Recent API key lifecycle events for {workspace.name}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="max-h-[620px] overflow-auto rounded-xl border">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="sticky top-0 bg-background">
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="p-3 font-medium">Time</th>
                    <th className="p-3 font-medium">Event</th>
                    <th className="p-3 font-medium">Key Prefix</th>
                    <th className="p-3 font-medium">Actor</th>
                    <th className="p-3 font-medium">Request</th>
                    <th className="p-3 font-medium">IP</th>
                    <th className="p-3 font-medium">Metadata</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map(event => (
                    <tr key={event.id} className="border-b last:border-b-0">
                      <td className="p-3 text-xs text-muted-foreground">
                        {formatDate(event.createdAt)}
                      </td>
                      <td className="p-3">
                        <Badge variant="outline">
                          {formatEventType(event.eventType)}
                        </Badge>
                      </td>
                      <td className="p-3 font-mono text-xs">
                        {event.keyPrefix}••••
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {event.actorType}
                      </td>
                      <td className="p-3 font-mono text-xs text-muted-foreground">
                        {event.requestId ?? '—'}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {event.ipAddress ?? '—'}
                      </td>
                      <td className="max-w-sm truncate p-3 text-xs text-muted-foreground">
                        {formatMetadata(event.metadata)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="rounded-md border border-dashed p-12 text-center">
      <ShieldCheck className="mx-auto size-12 text-muted-foreground/50" />
      <h3 className="mt-4 text-lg font-medium">No lifecycle events yet</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Create, pause, resume, or revoke an API key to populate this audit log.
      </p>
    </div>
  )
}
