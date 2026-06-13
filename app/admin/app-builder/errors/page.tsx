import Link from 'next/link'

import { getAppErrorsForAdmin } from '@/lib/actions/admin-appbuilder'

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

export default async function AdminAppBuilderErrorsPage({
  searchParams
}: {
  searchParams: Promise<{ projectId?: string }>
}) {
  const { projectId } = await searchParams
  const errors = await getAppErrorsForAdmin(projectId)

  return (
    <div className="space-y-6 px-4 pb-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">App Build Errors</h1>
        <p className="text-muted-foreground">
          Failed builds and error codes from the App Builder pipeline.
        </p>
        {projectId ? (
          <p className="text-xs text-muted-foreground">
            Filtered by projectId: {projectId} ·{' '}
            <Link
              href="/admin/app-builder/errors"
              className="text-primary hover:underline"
            >
              clear
            </Link>
          </p>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Project</th>
              <th className="px-3 py-2 text-left font-medium">Workspace</th>
              <th className="px-3 py-2 text-left font-medium">Code</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Repairs</th>
              <th className="px-3 py-2 text-left font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {errors.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  No errors recorded.
                </td>
              </tr>
            ) : (
              errors.map(err => (
                <tr key={err.id} className="border-b align-top last:border-0">
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/app-builder/projects/${err.projectId}`}
                      className="font-medium hover:underline"
                    >
                      {err.projectName}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{err.workspaceName}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {err.errorCode ?? '—'}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="destructive">{err.status}</Badge>
                  </td>
                  <td className="px-3 py-2 text-right">{err.repairAttempts}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {formatDateTime(err.createdAt)}
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
