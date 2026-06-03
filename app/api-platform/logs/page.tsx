import { redirect } from 'next/navigation'

import { AlertTriangle, ScrollText } from 'lucide-react'

import { getLogsForUser, type UserLogEntry } from '@/lib/actions/api-logs'
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

function formatTokens(input: number | null, output: number | null) {
  return ((input ?? 0) + (output ?? 0)).toLocaleString()
}

export default async function LogsPage() {
  const user = await requireFeatureAccess('/api-platform/logs', 'api_platform')
  if (!user) {
    redirect(
      `/auth/login?redirectTo=${encodeURIComponent('/api-platform/logs')}`
    )
  }

  const logs = await getLogsForUser(100)

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden rounded-xl shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScrollText className="size-5" />
            Request Logs
          </CardTitle>
          <CardDescription>
            Your recent API requests across all surfaces and endpoints.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="max-h-[600px] overflow-auto rounded-xl border">
              <table className="w-full min-w-[800px] text-sm">
                <thead className="sticky top-0 bg-background">
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="p-3 font-medium">Time</th>
                    <th className="p-3 font-medium">Endpoint</th>
                    <th className="p-3 font-medium">Model</th>
                    <th className="p-3 font-medium">Provider</th>
                    <th className="p-3 font-medium">Surface</th>
                    <th className="p-3 text-right font-medium">Tokens</th>
                    <th className="p-3 text-right font-medium">Latency</th>
                    <th className="p-3 text-right font-medium">Cost</th>
                    <th className="p-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id} className="border-b last:border-b-0">
                      <td className="p-3 text-xs text-muted-foreground">
                        {formatDate(log.createdAt)}
                      </td>
                      <td className="p-3">
                        <Badge variant="outline">{log.endpoint}</Badge>
                      </td>
                      <td className="p-3">{log.model}</td>
                      <td className="p-3 text-muted-foreground">
                        {log.provider}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {log.surface}
                      </td>
                      <td className="p-3 text-right">
                        {formatTokens(log.inputTokens, log.outputTokens)}
                      </td>
                      <td className="p-3 text-right text-muted-foreground">
                        {log.latencyMs ? `${log.latencyMs}ms` : '—'}
                      </td>
                      <td className="p-3 text-right text-muted-foreground">
                        {log.billedUsd !== '0'
                          ? `$${Number(log.billedUsd).toFixed(4)}`
                          : '—'}
                      </td>
                      <td className="p-3">
                        <Badge
                          variant={
                            log.status === 'success'
                              ? 'secondary'
                              : 'destructive'
                          }
                          className="gap-1"
                        >
                          {log.status !== 'success' ? (
                            <AlertTriangle className="size-3" />
                          ) : null}
                          {log.status}
                        </Badge>
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
      <ScrollText className="mx-auto size-12 text-muted-foreground/50" />
      <h3 className="mt-4 text-lg font-medium">No logs yet</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Your API request logs will appear here after you start making requests.
      </p>
    </div>
  )
}
