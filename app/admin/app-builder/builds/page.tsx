import Link from 'next/link'

import { getAppBuildsForAdmin } from '@/lib/actions/admin-appbuilder'

import { Badge } from '@/components/ui/badge'

export const dynamic = 'force-dynamic'

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value))
}

function statusVariant(status: string) {
  if (status === 'passed' || status === 'completed') return 'default' as const
  if (status === 'failed') return 'destructive' as const
  return 'outline' as const
}

export default async function AdminAppBuilderBuildsPage({
  searchParams
}: {
  searchParams: Promise<{ projectId?: string }>
}) {
  const { projectId } = await searchParams
  const builds = await getAppBuildsForAdmin(projectId)

  return (
    <div className="space-y-6 px-4 pb-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">App Builds</h1>
        <p className="text-muted-foreground">
          Build command, install logs, type errors, vite errors, and final
          status.
        </p>
        {projectId ? (
          <p className="text-xs text-muted-foreground">
            Filtered by projectId: {projectId} ·{' '}
            <Link
              href="/admin/app-builder/builds"
              className="text-primary hover:underline"
            >
              clear
            </Link>
          </p>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[1100px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Project</th>
              <th className="px-3 py-2 text-left font-medium">Workspace</th>
              <th className="px-3 py-2 text-left font-medium">Build cmd</th>
              <th className="px-3 py-2 text-left font-medium">Install cmd</th>
              <th className="px-3 py-2 text-right font-medium">TS</th>
              <th className="px-3 py-2 text-right font-medium">Vite</th>
              <th className="px-3 py-2 text-right font-medium">Repairs</th>
              <th className="px-3 py-2 text-right font-medium">Duration</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-left font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {builds.length === 0 ? (
              <tr>
                <td
                  colSpan={10}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  No build runs yet.
                </td>
              </tr>
            ) : (
              builds.map(build => (
                <tr key={build.id} className="border-b align-top last:border-0">
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/app-builder/projects/${build.projectId}`}
                      className="font-medium hover:underline"
                    >
                      {build.projectName}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{build.workspaceName}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {build.buildCommand ?? '—'}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {build.installCommand ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {build.typeErrorCount}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {build.viteErrorCount}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {build.repairAttempts}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {(build.durationMs / 1000).toFixed(1)}s
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={statusVariant(build.status)}>
                      {build.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {formatDateTime(build.createdAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
