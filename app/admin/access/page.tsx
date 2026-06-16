import {
  addAppAccessAllowlistEmail,
  getAppAccessAllowlist,
  getAppAccessRequests,
  rejectAppAccessRequest,
  revokeAppAccessAllowlistEmail,
  updateAppAccessAllowlistFeatures
} from '@/lib/actions/admin-access'
import { APP_FEATURES, AppFeature } from '@/lib/auth/app-access'
import { requirePageAuth } from '@/lib/auth/require-page-auth'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

export const dynamic = 'force-dynamic'

const FEATURE_LABELS: Record<AppFeature, string> = {
  search: 'Search',
  brokmail: 'BrokMail',
  brokcode: 'BrokCode / Builder',
  tools: 'Tools',
  api_platform: 'API platform',
  presentations: 'Presentations'
}

function getEntryFeatures(features: string[] | null | undefined) {
  if (!Array.isArray(features)) return new Set<AppFeature>(APP_FEATURES)

  return new Set(
    features.filter((feature): feature is AppFeature =>
      APP_FEATURES.includes(feature as AppFeature)
    )
  )
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value))
}

function formatFeatureSummary(features: string[] | null | undefined) {
  if (!Array.isArray(features)) return 'All tools'

  const normalized = [...getEntryFeatures(features)]
  if (normalized.length === APP_FEATURES.length) return 'All tools'

  return normalized.map(feature => FEATURE_LABELS[feature]).join(', ')
}

function FeatureCheckboxes({ selected }: { selected?: Set<AppFeature> }) {
  const selectedFeatures = selected ?? new Set<AppFeature>(APP_FEATURES)

  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {APP_FEATURES.map(feature => (
        <label
          key={feature}
          className="inline-flex min-h-11 items-center gap-2 rounded-md border bg-background px-2.5 text-xs font-medium text-muted-foreground"
        >
          <input
            name="features"
            type="checkbox"
            value={feature}
            defaultChecked={selectedFeatures.has(feature)}
            className="size-5 accent-primary"
          />
          {FEATURE_LABELS[feature]}
        </label>
      ))}
    </div>
  )
}

export default async function AdminAccessPage() {
  await requirePageAuth('/admin/access')
  const [allowlist, accessRequests] = await Promise.all([
    getAppAccessAllowlist(),
    getAppAccessRequests()
  ])

  return (
    <div className="space-y-6 px-4 pb-8 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-3xl font-bold">Access Control</h1>
        <p className="text-muted-foreground">
          Grant durable app access by email for all tools or selected product
          surfaces.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Grant access</CardTitle>
          <p className="text-sm text-muted-foreground">
            New grants are written to the database allowlist used by page and
            API feature guards.
          </p>
        </CardHeader>
        <CardContent>
          <form action={addAppAccessAllowlistEmail} className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)]">
              <Input
                name="email"
                type="email"
                placeholder="teammate@company.com"
                required
                className="h-11"
              />
              <Input
                name="note"
                placeholder="Launch cohort, customer account, or approval note"
                className="h-11"
              />
            </div>

            <div className="grid gap-3 lg:grid-cols-[220px_1fr_auto] lg:items-start">
              <div className="space-y-2">
                <label className="flex min-h-11 items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium">
                  <input
                    name="featureScope"
                    type="radio"
                    value="all"
                    defaultChecked
                    className="size-4 accent-primary"
                  />
                  All tools
                </label>
                <label className="flex min-h-11 items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium">
                  <input
                    name="featureScope"
                    type="radio"
                    value="specific"
                    className="size-4 accent-primary"
                  />
                  Specific tools
                </label>
              </div>

              <FeatureCheckboxes />

              <Button type="submit" className="h-11">
                Grant access
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pending requests</CardTitle>
          <p className="text-sm text-muted-foreground">
            People without access can request a review from login or the access
            pending screen.
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Email</th>
                  <th className="px-3 py-2 text-left font-medium">Phone</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-left font-medium">Source</th>
                  <th className="px-3 py-2 text-left font-medium">Submitted</th>
                  <th className="px-3 py-2 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {accessRequests.length === 0 ? (
                  <tr>
                    <td
                      className="px-3 py-8 text-center text-muted-foreground"
                      colSpan={6}
                    >
                      No access requests yet.
                    </td>
                  </tr>
                ) : (
                  accessRequests.map(request => (
                    <tr key={request.id} className="border-b last:border-b-0">
                      <td className="px-3 py-3 font-medium">{request.email}</td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {request.phoneNumber}
                      </td>
                      <td className="px-3 py-3">
                        <Badge
                          variant={
                            request.status === 'pending'
                              ? 'secondary'
                              : request.status === 'approved'
                                ? 'default'
                                : 'outline'
                          }
                        >
                          {request.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {request.source || '-'}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {formatDateTime(request.createdAt)}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-2">
                          <form action={addAppAccessAllowlistEmail}>
                            <input
                              name="requestId"
                              type="hidden"
                              value={request.id}
                            />
                            <input
                              name="email"
                              type="hidden"
                              value={request.email}
                            />
                            <input
                              name="note"
                              type="hidden"
                              value={`Approved from access request ${request.id}`}
                            />
                            <input
                              name="featureScope"
                              type="hidden"
                              value="all"
                            />
                            <Button
                              type="submit"
                              size="sm"
                              className="h-10"
                              disabled={request.status !== 'pending'}
                            >
                              Grant all
                            </Button>
                          </form>
                          <form action={rejectAppAccessRequest}>
                            <input
                              name="requestId"
                              type="hidden"
                              value={request.id}
                            />
                            <Button
                              type="submit"
                              size="sm"
                              variant="outline"
                              className="h-10"
                              disabled={request.status !== 'pending'}
                            >
                              Reject
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current grants</CardTitle>
          <p className="text-sm text-muted-foreground">
            `All tools` is stored as a database-wide grant; selected tools are
            stored as explicit feature scopes.
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[1040px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Email</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-left font-medium">
                    Current access
                  </th>
                  <th className="px-3 py-2 text-left font-medium">Edit</th>
                  <th className="px-3 py-2 text-left font-medium">Note</th>
                  <th className="px-3 py-2 text-left font-medium">Updated</th>
                  <th className="px-3 py-2 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {allowlist.length === 0 ? (
                  <tr>
                    <td
                      className="px-3 py-8 text-center text-muted-foreground"
                      colSpan={7}
                    >
                      No app access grants yet.
                    </td>
                  </tr>
                ) : (
                  allowlist.map(entry => {
                    const entryFeatures = getEntryFeatures(entry.features)
                    const hasAllTools = !Array.isArray(entry.features)

                    return (
                      <tr key={entry.id} className="border-b last:border-b-0">
                        <td className="px-3 py-3 font-medium">{entry.email}</td>
                        <td className="px-3 py-3">
                          <Badge
                            variant={
                              entry.status === 'active'
                                ? 'default'
                                : 'secondary'
                            }
                          >
                            {entry.status}
                          </Badge>
                        </td>
                        <td className="max-w-[220px] px-3 py-3 text-muted-foreground">
                          {formatFeatureSummary(entry.features)}
                        </td>
                        <td className="px-3 py-3">
                          <form
                            action={updateAppAccessAllowlistFeatures}
                            className="space-y-3"
                          >
                            <input name="id" type="hidden" value={entry.id} />
                            <div className="flex flex-wrap gap-2">
                              <label className="inline-flex min-h-9 items-center gap-2 rounded-md border bg-background px-2.5 text-xs font-medium">
                                <input
                                  name="featureScope"
                                  type="radio"
                                  value="all"
                                  defaultChecked={hasAllTools}
                                  className="size-4 accent-primary"
                                />
                                All tools
                              </label>
                              <label className="inline-flex min-h-9 items-center gap-2 rounded-md border bg-background px-2.5 text-xs font-medium">
                                <input
                                  name="featureScope"
                                  type="radio"
                                  value="specific"
                                  defaultChecked={!hasAllTools}
                                  className="size-4 accent-primary"
                                />
                                Specific tools
                              </label>
                            </div>
                            <FeatureCheckboxes selected={entryFeatures} />
                            <Button
                              type="submit"
                              size="sm"
                              variant="outline"
                              className="h-10"
                              disabled={entry.status !== 'active'}
                            >
                              Save access
                            </Button>
                          </form>
                        </td>
                        <td className="max-w-[220px] truncate px-3 py-3 text-muted-foreground">
                          {entry.note || '-'}
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">
                          {formatDateTime(entry.updatedAt)}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <form action={revokeAppAccessAllowlistEmail}>
                            <input name="id" type="hidden" value={entry.id} />
                            <Button
                              type="submit"
                              size="sm"
                              variant="outline"
                              className="h-10"
                              disabled={entry.status !== 'active'}
                            >
                              Revoke
                            </Button>
                          </form>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
