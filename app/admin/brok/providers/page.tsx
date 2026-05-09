import { getProviderRoutes } from '@/lib/actions/admin-brok';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default async function AdminProvidersPage() {
  const routes = await getProviderRoutes();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Provider Routing</h1>
        <p className="text-muted-foreground">
          Configure how Brok models route to backend providers
        </p>
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
                  <td colSpan={8} className="p-4 text-center text-muted-foreground">
                    No provider routes configured
                  </td>
                </tr>
              ) : (
                routes.map((route) => (
                  <tr key={route.id} className="border-b">
                    <td className="p-4 font-medium">{route.brokModel}</td>
                    <td className="p-4">{route.providerName}</td>
                    <td className="p-4 font-mono text-sm">{route.providerModel}</td>
                    <td className="p-4">{route.priority}</td>
                    <td className="p-4">${route.inputCostPerMillion}</td>
                    <td className="p-4">${route.outputCostPerMillion}</td>
                    <td className="p-4">
                      <Badge variant={route.isActive ? 'default' : 'secondary'}>
                        {route.isActive ? 'Active' : 'Disabled'}
                      </Badge>
                    </td>
                    <td className="p-4">
                      <Button variant="outline" size="sm">
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
