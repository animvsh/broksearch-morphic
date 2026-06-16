import Link from 'next/link'

import {
  deleteAppProject,
  getAllAppProjectsForAdmin,
  setAppProjectPreview,
  setAppProjectStatus
} from '@/lib/actions/admin-appbuilder'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

const STATUSES = [
  'draft',
  'generating',
  'preview_ready',
  'build_failed',
  'exported',
  'deleted',
  'suspended'
] as const

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value > 10 ? 2 : 4,
    maximumFractionDigits: value > 10 ? 2 : 4
  }).format(value)
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value))
}

function statusVariant(status: string) {
  if (status === 'preview_ready' || status === 'ready' || status === 'exported')
    return 'default' as const
  if (status === 'failed' || status === 'build_failed')
    return 'destructive' as const
  if (status === 'suspended' || status === 'deleted')
    return 'secondary' as const
  return 'outline' as const
}

export default async function AdminAppBuilderProjectsPage() {
  const projects = await getAllAppProjectsForAdmin()

  return (
    <div className="space-y-6 px-4 pb-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">App Projects</h1>
        <p className="text-muted-foreground">
          Every Lovable / Dyad-style app project generated inside Brok.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[1280px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Project</th>
              <th className="px-3 py-2 text-left font-medium">Owner</th>
              <th className="px-3 py-2 text-left font-medium">Workspace</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-left font-medium">Build</th>
              <th className="px-3 py-2 text-right font-medium">Files</th>
              <th className="px-3 py-2 text-right font-medium">Generations</th>
              <th className="px-3 py-2 text-left font-medium">Preview</th>
              <th className="px-3 py-2 text-right font-medium">Tokens</th>
              <th className="px-3 py-2 text-right font-medium">Cost</th>
              <th className="px-3 py-2 text-left font-medium">Created</th>
              <th className="px-3 py-2 text-left font-medium">Updated</th>
              <th className="px-3 py-2 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {projects.length === 0 ? (
              <tr>
                <td
                  colSpan={13}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  No app projects yet
                </td>
              </tr>
            ) : (
              projects.map(project => (
                <tr
                  key={project.id}
                  className="border-b align-top last:border-0"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/app-builder/projects/${project.id}`}
                      className="font-medium hover:underline"
                    >
                      {project.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {project.slug}
                    </p>
                  </td>
                  <td className="px-3 py-2">
                    <p className="max-w-36 truncate font-mono text-xs">
                      {project.ownerId}
                    </p>
                  </td>
                  <td className="px-3 py-2">{project.workspaceName}</td>
                  <td className="px-3 py-2">
                    <Badge variant={statusVariant(project.status)}>
                      {project.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline">{project.buildStatus}</Badge>
                  </td>
                  <td className="px-3 py-2 text-right">{project.fileCount}</td>
                  <td className="px-3 py-2 text-right">
                    {project.generationCount}
                  </td>
                  <td className="px-3 py-2">
                    {project.previewUrl ? (
                      <a
                        href={project.previewUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline"
                      >
                        open
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {project.tokensUsed.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {formatCurrency(project.costUsd)}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {formatDateTime(project.createdAt)}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {formatDateTime(project.updatedAt)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex min-w-[260px] flex-wrap gap-1.5">
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="h-7"
                      >
                        <Link
                          href={`/admin/app-builder/projects/${project.id}`}
                        >
                          Open
                        </Link>
                      </Button>
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="h-7"
                      >
                        <Link
                          href={`/admin/app-builder/files?projectId=${project.id}`}
                        >
                          Files
                        </Link>
                      </Button>
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="h-7"
                      >
                        <Link
                          href={`/admin/app-builder/generations?projectId=${project.id}`}
                        >
                          Generations
                        </Link>
                      </Button>
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="h-7"
                      >
                        <Link
                          href={`/admin/app-builder/builds?projectId=${project.id}`}
                        >
                          Builds
                        </Link>
                      </Button>
                      {project.previewUrl ? (
                        <form action={setAppProjectPreview}>
                          <input type="hidden" name="id" value={project.id} />
                          <input type="hidden" name="enabled" value="false" />
                          <Button
                            type="submit"
                            size="sm"
                            variant="outline"
                            className="h-7"
                          >
                            Disable preview
                          </Button>
                        </form>
                      ) : null}
                      {project.status !== 'suspended' ? (
                        <form action={setAppProjectStatus}>
                          <input type="hidden" name="id" value={project.id} />
                          <input
                            type="hidden"
                            name="status"
                            value="suspended"
                          />
                          <Button
                            type="submit"
                            size="sm"
                            variant="outline"
                            className="h-7"
                          >
                            Suspend
                          </Button>
                        </form>
                      ) : null}
                      <form action={deleteAppProject}>
                        <input type="hidden" name="id" value={project.id} />
                        <Button
                          type="submit"
                          size="sm"
                          variant="destructive"
                          className="h-7"
                        >
                          Delete
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

      <div className="text-xs text-muted-foreground">
        Available statuses: {STATUSES.join(', ')}
      </div>
    </div>
  )
}
