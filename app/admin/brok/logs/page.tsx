import { getUsageForAdmin } from '@/lib/actions/admin-brok'
import { requirePageAuth } from '@/lib/auth/require-page-auth'

import { Badge } from '@/components/ui/badge'

export const dynamic = 'force-dynamic'

export default async function AdminLogsPage({
  searchParams
}: {
  searchParams: Promise<{ model?: string; endpoint?: string }>
}) {
  await requirePageAuth('/admin/brok/logs')
  const params = await searchParams
  const logs = await getUsageForAdmin({
    model: params.model,
    endpoint: params.endpoint
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Brok API Logs</h1>
        <p className="text-muted-foreground">View all Brok API request logs</p>
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-4 font-medium">Request ID</th>
                <th className="text-left p-4 font-medium">Workspace</th>
                <th className="text-left p-4 font-medium">Endpoint</th>
                <th className="text-left p-4 font-medium">Model</th>
                <th className="text-left p-4 font-medium">Input Tokens</th>
                <th className="text-left p-4 font-medium">Output Tokens</th>
                <th className="text-left p-4 font-medium">Cost</th>
                <th className="text-left p-4 font-medium">Latency</th>
                <th className="text-left p-4 font-medium">Status</th>
                <th className="text-left p-4 font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="p-4 text-center text-muted-foreground"
                  >
                    No logs found
                  </td>
                </tr>
              ) : (
                logs.map(log => (
                  <tr key={log.id} className="border-b">
                    <td className="p-4 font-mono text-xs">
                      {log.requestId.slice(0, 12)}...
                    </td>
                    <td className="p-4">{log.workspaceName}</td>
                    <td className="p-4">
                      <Badge variant="outline">{log.endpoint}</Badge>
                    </td>
                    <td className="p-4">{log.model}</td>
                    <td className="p-4">{log.inputTokens}</td>
                    <td className="p-4">{log.outputTokens}</td>
                    <td className="p-4">${Number(log.billedUsd).toFixed(4)}</td>
                    <td className="p-4">{log.latencyMs}ms</td>
                    <td className="p-4">
                      <Badge
                        variant={
                          log.status === 'success' ? 'default' : 'destructive'
                        }
                      >
                        {log.status}
                      </Badge>
                    </td>
                    <td className="p-4">
                      {new Date(log.createdAt).toLocaleString()}
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
