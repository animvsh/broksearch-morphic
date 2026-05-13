import { getProviderRoutes, saveProviderRoute } from '@/lib/actions/admin-brok'
import { requirePageAuth } from '@/lib/auth/require-page-auth'
import { BROK_MODELS } from '@/lib/brok/models'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

export default async function AdminProvidersPage() {
  await requirePageAuth('/admin/brok/providers')
  let routes = await getProviderRoutes()
  if (!routes.length) {
    routes = Object.entries(BROK_MODELS).map(([brokModel, config], index) => ({
      id: `fallback-${brokModel}`,
      brokModel,
      providerName: config.provider,
      providerModel: config.providerModel,
      priority: index + 1,
      inputCostPerMillion: config.inputCostPerMillion.toFixed(4),
      outputCostPerMillion: config.outputCostPerMillion.toFixed(4),
      isActive: true
    }))
  }
  const isDegraded = routes.some(route => route.id.startsWith('fallback-'))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Provider Routing</h1>
        <p className="text-muted-foreground">
          Configure how Brok models route to backend providers
        </p>
        {isDegraded ? (
          <p className="text-xs text-amber-600 mt-2">
            Running in fallback mode while database connectivity recovers.
          </p>
        ) : null}
      </div>

      <div className="rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-4 font-medium">Brok Model</th>
                <th className="text-left p-4 font-medium">Provider</th>
                <th className="text-left p-4 font-medium">Provider Model</th>
                <th className="text-left p-4 font-medium">Priority</th>
                <th className="text-left p-4 font-medium">Input Cost/M</th>
                <th className="text-left p-4 font-medium">Output Cost/M</th>
                <th className="text-left p-4 font-medium">Status</th>
                <th className="text-left p-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {routes.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="p-4 text-center text-muted-foreground"
                  >
                    No provider routes configured
                  </td>
                </tr>
              ) : (
                routes.map(route => (
                  <tr key={route.id} className="border-b">
                    <td className="p-4 font-medium">{route.brokModel}</td>
                    <td className="p-4">{route.providerName}</td>
                    <td className="p-4 font-mono text-sm">
                      {route.providerModel}
                    </td>
                    <td className="p-4" colSpan={5}>
                      <form
                        action={saveProviderRoute}
                        className="grid gap-3 md:grid-cols-[100px_150px_150px_120px_auto] md:items-center"
                      >
                        <input type="hidden" name="id" value={route.id} />
                        <input
                          type="number"
                          min={1}
                          name="priority"
                          defaultValue={route.priority ?? 1}
                          className="h-9 rounded-md border bg-background px-3 text-sm"
                        />
                        <input
                          type="number"
                          min={0}
                          step="0.0001"
                          name="inputCostPerMillion"
                          defaultValue={route.inputCostPerMillion}
                          className="h-9 rounded-md border bg-background px-3 text-sm"
                        />
                        <input
                          type="number"
                          min={0}
                          step="0.0001"
                          name="outputCostPerMillion"
                          defaultValue={route.outputCostPerMillion}
                          className="h-9 rounded-md border bg-background px-3 text-sm"
                        />
                        <label className="flex items-center gap-2 text-sm text-muted-foreground">
                          <input
                            type="checkbox"
                            name="isActive"
                            defaultChecked={route.isActive}
                          />
                          <Badge
                            variant={route.isActive ? 'default' : 'secondary'}
                          >
                            {route.isActive ? 'Active' : 'Disabled'}
                          </Badge>
                        </label>
                        <Button variant="outline" size="sm" type="submit">
                          Save
                        </Button>
                      </form>
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
