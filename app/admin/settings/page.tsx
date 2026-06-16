import { getAdminSettings } from '@/lib/actions/admin-settings'
import { AdminRole, AdminRoleCapabilities } from '@/lib/auth/admin-roles'
import { requirePageAuth } from '@/lib/auth/require-page-auth'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

const CAPABILITY_LABELS: Record<string, string> = {
  canManageUsers: 'Manage users',
  canManageProjects: 'Manage projects',
  canManageDecks: 'Manage decks',
  canManageApiKeys: 'Manage API keys',
  canManageProviders: 'Manage providers',
  canViewCosts: 'View costs',
  canViewBilling: 'View billing',
  canChangeLimits: 'Change limits',
  canChangeBilling: 'Change billing',
  canIssueRefunds: 'Issue refunds',
  canViewLogs: 'View logs',
  canViewProviderSecrets: 'View provider secrets',
  canToggleModel: 'Toggle model',
  canToggleProvider: 'Toggle provider',
  canModerateContent: 'Moderate content',
  canReadOnly: 'Read-only'
}

const CAPABILITY_ORDER = Object.keys(CAPABILITY_LABELS)

const ROLE_DESCRIPTIONS: Record<string, string> = {
  owner:
    'Full access to every surface, including billing, providers, and roles.',
  admin:
    'Manage users, projects, decks, API keys, providers; view costs and change limits.',
  support:
    'View users, projects, and logs. No provider secrets, billing, or providers.',
  finance: 'View billing and costs; issue refunds. No content moderation.',
  viewer: 'Read-only access to dashboards.'
}

function formatBool(value: boolean) {
  return value ? 'Yes' : 'No'
}

export default async function AdminSettingsPage() {
  await requirePageAuth('/admin/settings')
  const settings = await getAdminSettings()

  return (
    <div className="space-y-6 px-4 pb-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Admin Settings</h1>
          <p className="text-muted-foreground">
            Roles, kill switches, and model availability. Changes here are
            written to the admin audit log.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Roles & Permissions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="py-2 pr-4 text-left font-medium">
                    Capability
                  </th>
                  {settings.roles.map(role => (
                    <th
                      key={role}
                      className="px-2 py-2 text-left font-medium capitalize"
                    >
                      {role}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="py-3 pr-4 text-xs text-muted-foreground">
                    Description
                  </td>
                  {settings.roles.map(role => (
                    <td
                      key={role}
                      className="px-2 py-3 text-xs text-muted-foreground"
                    >
                      {ROLE_DESCRIPTIONS[role]}
                    </td>
                  ))}
                </tr>
                {CAPABILITY_ORDER.map(capability => (
                  <tr key={capability} className="border-b last:border-b-0">
                    <td className="py-2 pr-4 font-medium">
                      {CAPABILITY_LABELS[capability]}
                    </td>
                    {settings.roles.map(role => {
                      const value =
                        settings.capabilities[role as AdminRole][
                          capability as keyof AdminRoleCapabilities
                        ]
                      return (
                        <td key={role} className="px-2 py-2">
                          <Badge
                            variant={value ? 'default' : 'outline'}
                            className="font-mono"
                          >
                            {formatBool(Boolean(value))}
                          </Badge>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Provider Kill Switches</CardTitle>
            <p className="text-sm text-muted-foreground">
              Disable a provider to immediately stop all new traffic. Toggling
              writes a provider.kill_switch_toggled audit event.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {settings.providerToggles.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No providers configured yet.
              </p>
            ) : (
              settings.providerToggles.map(provider => (
                <div
                  key={provider.providerName}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div>
                    <p className="font-medium capitalize">
                      {provider.providerName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {provider.activeModelCount} of {provider.totalModelCount}{' '}
                      models active
                    </p>
                  </div>
                  <Badge
                    variant={provider.killSwitch ? 'destructive' : 'default'}
                  >
                    {provider.killSwitch ? 'Killed' : 'Live'}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Model Toggles</CardTitle>
            <p className="text-sm text-muted-foreground">
              Disable individual Brok models. Each toggle creates a
              provider.model_toggled audit log.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {settings.modelToggles.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No models configured yet.
              </p>
            ) : (
              settings.modelToggles.map(model => (
                <div
                  key={model.brokModel}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div>
                    <p className="font-medium">{model.displayName}</p>
                    <p className="text-xs text-muted-foreground">
                      {model.brokModel} · {model.provider}
                    </p>
                  </div>
                  <Badge variant={model.isActive ? 'default' : 'secondary'}>
                    {model.isActive ? 'enabled' : 'disabled'}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Platform Flags</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                New signups
              </p>
              <p className="text-lg font-semibold">
                {settings.flags.allowNewSignups ? 'Open' : 'Closed'}
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                New API keys
              </p>
              <p className="text-lg font-semibold">
                {settings.flags.allowNewApiKeys ? 'Open' : 'Closed'}
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Billing
              </p>
              <p className="text-lg font-semibold">
                {settings.flags.billingPauseAll ? 'Paused' : 'Active'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
