import {
  getAllApiKeysForAdmin,
  pauseAdminApiKey,
  resumeAdminApiKey,
  revokeAdminApiKey
} from '@/lib/actions/admin-brok'
import { requirePageAuth } from '@/lib/auth/require-page-auth'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

export default async function AdminApiKeysPage() {
  await requirePageAuth('/admin/brok/api-keys')

  const keys = await getAllApiKeysForAdmin()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Brok API Keys</h1>
        <p className="text-muted-foreground">Manage all Brok API keys</p>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-4 font-medium">Name</th>
                <th className="text-left p-4 font-medium">Workspace</th>
                <th className="text-left p-4 font-medium">Key Prefix</th>
                <th className="text-left p-4 font-medium">Environment</th>
                <th className="text-left p-4 font-medium">Status</th>
                <th className="text-left p-4 font-medium">RPM Limit</th>
                <th className="text-left p-4 font-medium">Daily</th>
                <th className="text-left p-4 font-medium">Budget</th>
                <th className="text-left p-4 font-medium">Scopes</th>
                <th className="text-left p-4 font-medium">Models</th>
                <th className="text-left p-4 font-medium">Last Used</th>
                <th className="text-left p-4 font-medium">Created</th>
                <th className="text-left p-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.length === 0 ? (
                <tr>
                  <td
                    colSpan={13}
                    className="p-4 text-center text-muted-foreground"
                  >
                    No API keys found
                  </td>
                </tr>
              ) : (
                keys.map(key => (
                  <tr key={key.id} className="border-b">
                    <td className="p-4 font-medium">{key.name}</td>
                    <td className="p-4">{key.workspaceName}</td>
                    <td className="p-4 font-mono text-sm">
                      {key.keyPrefix}••••••••
                    </td>
                    <td className="p-4">
                      <Badge
                        variant={
                          key.environment === 'live' ? 'default' : 'secondary'
                        }
                      >
                        {key.environment}
                      </Badge>
                    </td>
                    <td className="p-4">
                      <Badge
                        variant={
                          key.status === 'active'
                            ? 'default'
                            : key.status === 'paused'
                              ? 'secondary'
                              : 'destructive'
                        }
                      >
                        {key.status}
                      </Badge>
                    </td>
                    <td className="p-4">{key.rpmLimit}</td>
                    <td className="p-4">{key.dailyRequestLimit}</td>
                    <td className="p-4">
                      {key.monthlyBudgetCents
                        ? `$${(key.monthlyBudgetCents / 100).toFixed(2)}`
                        : 'Unlimited'}
                    </td>
                    <td className="p-4">
                      <div className="flex max-w-56 flex-wrap gap-1">
                        {key.scopes.map(scope => (
                          <Badge key={scope} variant="outline">
                            {scope}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="p-4 text-sm text-muted-foreground">
                      {key.allowedModels.length > 0
                        ? key.allowedModels.join(', ')
                        : 'All models'}
                    </td>
                    <td className="p-4">
                      {key.lastUsedAt
                        ? new Date(key.lastUsedAt).toLocaleString()
                        : 'Never'}
                    </td>
                    <td className="p-4">
                      {new Date(key.createdAt).toLocaleDateString()}
                    </td>
                    <td className="p-4">
                      <div className="flex gap-2">
                        {key.status === 'active' ? (
                          <form action={pauseAdminApiKey.bind(null, key.id)}>
                            <Button variant="outline" size="sm" type="submit">
                              Pause
                            </Button>
                          </form>
                        ) : key.status === 'paused' ? (
                          <form action={resumeAdminApiKey.bind(null, key.id)}>
                            <Button variant="outline" size="sm" type="submit">
                              Resume
                            </Button>
                          </form>
                        ) : null}
                        <form action={revokeAdminApiKey.bind(null, key.id)}>
                          <Button variant="destructive" size="sm" type="submit">
                            Revoke
                          </Button>
                        </form>
                      </div>
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
