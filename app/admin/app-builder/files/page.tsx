import Link from 'next/link'

import { getAppProjectFilesForAdmin } from '@/lib/actions/admin-appbuilder'

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

export default async function AdminAppBuilderFilesPage({
  searchParams
}: {
  searchParams: Promise<{ projectId?: string }>
}) {
  const { projectId } = await searchParams
  const files = await getAppProjectFilesForAdmin(projectId)

  return (
    <div className="space-y-6 px-4 pb-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">App Project Files</h1>
        <p className="text-muted-foreground">
          Project file tree across all App Builder projects.
        </p>
        {projectId ? (
          <p className="text-xs text-muted-foreground">
            Filtered by projectId: {projectId} ·{' '}
            <Link
              href="/admin/app-builder/files"
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
              <th className="px-3 py-2 text-left font-medium">Path</th>
              <th className="px-3 py-2 text-left font-medium">Language</th>
              <th className="px-3 py-2 text-right font-medium">Size</th>
              <th className="px-3 py-2 text-left font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {files.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  No files recorded.
                </td>
              </tr>
            ) : (
              files.map(file => (
                <tr key={file.id} className="border-b align-top last:border-0">
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/app-builder/projects/${file.projectId}`}
                      className="font-medium hover:underline"
                    >
                      {file.projectName}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{file.workspaceName}</td>
                  <td className="px-3 py-2 font-mono text-xs">{file.path}</td>
                  <td className="px-3 py-2">
                    {file.language ? (
                      <Badge variant="outline">{file.language}</Badge>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">{file.sizeBytes}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {formatDateTime(file.updatedAt)}
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
