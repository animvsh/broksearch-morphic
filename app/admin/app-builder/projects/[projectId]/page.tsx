import Link from 'next/link'
import { notFound } from 'next/navigation'

import {
  getAppBuildsForAdmin,
  getAppCostsForAdmin,
  getAppDeploymentsForProject,
  getAppErrorsForAdmin,
  getAppExportsForProject,
  getAppGenerationsForAdmin,
  getAppProjectFilesForAdmin,
  getAppProjectForAdmin,
  getAppSecurityFlagsForProject,
  getAppVersionsForProject
} from '@/lib/actions/admin-appbuilder'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'prompts', label: 'Prompts' },
  { id: 'files', label: 'Files' },
  { id: 'diffs', label: 'Diffs' },
  { id: 'builds', label: 'Build Logs' },
  { id: 'preview', label: 'Preview' },
  { id: 'costs', label: 'Costs' },
  { id: 'errors', label: 'Errors' },
  { id: 'security', label: 'Security' }
] as const

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value))
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value > 10 ? 2 : 4,
    maximumFractionDigits: value > 10 ? 2 : 4
  }).format(value)
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

export default async function AdminAppProjectDetailPage({
  params
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  const [
    project,
    generations,
    files,
    builds,
    errors,
    costs,
    versions,
    deployments,
    exportsList,
    security
  ] = await Promise.all([
    getAppProjectForAdmin(projectId),
    getAppGenerationsForAdmin(projectId),
    getAppProjectFilesForAdmin(projectId),
    getAppBuildsForAdmin(projectId),
    getAppErrorsForAdmin(projectId),
    Promise.resolve(
      getAppCostsForAdmin().then(
        list => list.find(c => c.projectId === projectId) ?? null
      )
    ),
    getAppVersionsForProject(projectId),
    getAppDeploymentsForProject(projectId),
    getAppExportsForProject(projectId),
    getAppSecurityFlagsForProject(projectId)
  ])

  if (!project) {
    notFound()
  }

  return (
    <div className="space-y-6 px-4 pb-12 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link
            href="/admin/app-builder/projects"
            className="text-sm text-muted-foreground hover:underline"
          >
            ← All projects
          </Link>
          <h1 className="mt-2 text-3xl font-bold">{project.name}</h1>
          <p className="text-muted-foreground">
            {project.slug} · {project.workspaceName}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={statusVariant(project.status)}>
            {project.status}
          </Badge>
          <Badge variant="outline">Build: {project.buildStatus}</Badge>
          {project.previewUrl ? (
            <a
              href={project.previewUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              View preview
            </a>
          ) : null}
        </div>
      </div>

      <nav className="sticky top-0 z-10 -mx-4 flex flex-wrap gap-1 border-y bg-background/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        {SECTIONS.map(section => (
          <a
            key={section.id}
            href={`#${section.id}`}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {section.label}
          </a>
        ))}
      </nav>

      <section id="overview" className="space-y-4">
        <h2 className="text-xl font-semibold">Overview</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Project name
              </CardTitle>
            </CardHeader>
            <CardContent className="font-medium">{project.name}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Owner
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-mono text-xs">{project.ownerId}</p>
              <p className="text-xs text-muted-foreground">
                Workspace: {project.workspaceName}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Current status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant={statusVariant(project.status)}>
                {project.status}
              </Badge>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Framework
              </CardTitle>
            </CardHeader>
            <CardContent className="font-medium">
              {project.framework}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total files
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold">
              {project.fileCount}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total generations
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold">
              {project.generationCount}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Last build status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant="outline">{project.lastBuildStatus}</Badge>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total cost
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold">
              {formatCurrency(project.costUsd)}
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Initial prompt</CardTitle>
          </CardHeader>
          <CardContent>
            {project.initialPrompt ? (
              <p className="whitespace-pre-wrap text-sm">
                {project.initialPrompt}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                No initial prompt captured.
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Dependencies</CardTitle>
          </CardHeader>
          <CardContent>
            {project.dependencies.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No dependencies recorded.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {project.dependencies.map(dep => (
                  <Badge key={dep} variant="outline">
                    {dep}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Timestamps</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              Created: {formatDateTime(project.createdAt)}
            </p>
            <p className="text-sm">
              Updated: {formatDateTime(project.updatedAt)}
            </p>
          </CardContent>
        </Card>
      </section>

      <section id="prompts" className="space-y-4">
        <h2 className="text-xl font-semibold">Prompts</h2>
        <p className="text-sm text-muted-foreground">
          Every user prompt/edit and the resulting build.
        </p>
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Prompt</th>
                <th className="px-3 py-2 text-left font-medium">Timestamp</th>
                <th className="px-3 py-2 text-left font-medium">
                  Files changed
                </th>
                <th className="px-3 py-2 text-left font-medium">Model</th>
                <th className="px-3 py-2 text-right font-medium">Tokens</th>
                <th className="px-3 py-2 text-right font-medium">Cost</th>
                <th className="px-3 py-2 text-left font-medium">Build</th>
              </tr>
            </thead>
            <tbody>
              {generations.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-6 text-center text-muted-foreground"
                  >
                    No prompts recorded.
                  </td>
                </tr>
              ) : (
                generations.map(gen => (
                  <tr key={gen.id} className="border-b last:border-0">
                    <td className="max-w-md truncate px-3 py-2">
                      {gen.prompt}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {formatDateTime(gen.createdAt)}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {gen.filesChanged.length === 0
                        ? '—'
                        : gen.filesChanged.join(', ')}
                    </td>
                    <td className="px-3 py-2">{gen.model}</td>
                    <td className="px-3 py-2 text-right">
                      {gen.inputTokens + gen.outputTokens}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatCurrency(gen.costUsd)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={statusVariant(gen.status)}>
                        {gen.buildResult ?? gen.status}
                      </Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section id="files" className="space-y-4">
        <h2 className="text-xl font-semibold">Files</h2>
        <p className="text-sm text-muted-foreground">
          Project file tree. Admin can view file, copy file, view latest diff,
          view file history, and restore previous version.
        </p>
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-muted-foreground">
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
                    colSpan={4}
                    className="px-3 py-6 text-center text-muted-foreground"
                  >
                    No files recorded.
                  </td>
                </tr>
              ) : (
                files.map(file => (
                  <tr key={file.id} className="border-b last:border-0">
                    <td className="px-3 py-2 font-mono text-xs">{file.path}</td>
                    <td className="px-3 py-2">{file.language ?? '—'}</td>
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
      </section>

      <section id="diffs" className="space-y-4">
        <h2 className="text-xl font-semibold">Diffs</h2>
        <p className="text-sm text-muted-foreground">
          Latest diffs across the most recent generation runs. Use the Files tab
          to inspect file-level diff history.
        </p>
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Timestamp</th>
                <th className="px-3 py-2 text-left font-medium">Files</th>
                <th className="px-3 py-2 text-left font-medium">Model</th>
                <th className="px-3 py-2 text-left font-medium">Build</th>
              </tr>
            </thead>
            <tbody>
              {generations.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-6 text-center text-muted-foreground"
                  >
                    No diffs yet.
                  </td>
                </tr>
              ) : (
                generations.map(gen => (
                  <tr key={gen.id} className="border-b last:border-0">
                    <td className="px-3 py-2 text-muted-foreground">
                      {formatDateTime(gen.createdAt)}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {gen.filesChanged.length === 0
                        ? '—'
                        : gen.filesChanged.join(', ')}
                    </td>
                    <td className="px-3 py-2">{gen.model}</td>
                    <td className="px-3 py-2">
                      <Badge
                        variant={statusVariant(gen.buildResult ?? gen.status)}
                      >
                        {gen.buildResult ?? gen.status}
                      </Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section id="builds" className="space-y-4">
        <h2 className="text-xl font-semibold">Build Logs</h2>
        <p className="text-sm text-muted-foreground">
          Build command, install logs, TypeScript errors, Vite errors, repair
          attempts, final status, and duration.
        </p>
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Build cmd</th>
                <th className="px-3 py-2 text-right font-medium">TS errors</th>
                <th className="px-3 py-2 text-right font-medium">
                  Vite errors
                </th>
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
                    colSpan={7}
                    className="px-3 py-6 text-center text-muted-foreground"
                  >
                    No build runs yet.
                  </td>
                </tr>
              ) : (
                builds.map(build => (
                  <tr key={build.id} className="border-b last:border-0">
                    <td className="px-3 py-2 font-mono text-xs">
                      {build.buildCommand ?? '—'}
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
        {versions.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Versions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="px-3 py-2 text-left font-medium">
                        Command
                      </th>
                      <th className="px-3 py-2 text-left font-medium">
                        Runtime
                      </th>
                      <th className="px-3 py-2 text-left font-medium">
                        Branch
                      </th>
                      <th className="px-3 py-2 text-left font-medium">
                        Commit
                      </th>
                      <th className="px-3 py-2 text-left font-medium">
                        Status
                      </th>
                      <th className="px-3 py-2 text-left font-medium">
                        Created
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {versions.map(version => (
                      <tr key={version.id} className="border-b last:border-0">
                        <td className="px-3 py-2 font-mono text-xs">
                          {version.command}
                        </td>
                        <td className="px-3 py-2">{version.runtime}</td>
                        <td className="px-3 py-2">{version.branch ?? '—'}</td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {version.commitSha
                            ? version.commitSha.slice(0, 8)
                            : '—'}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant={statusVariant(version.status)}>
                            {version.status}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {formatDateTime(version.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ) : null}
        {deployments.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Deployments</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="px-3 py-2 text-left font-medium">
                        Provider
                      </th>
                      <th className="px-3 py-2 text-left font-medium">
                        Status
                      </th>
                      <th className="px-3 py-2 text-left font-medium">URL</th>
                      <th className="px-3 py-2 text-left font-medium">
                        Subdomain
                      </th>
                      <th className="px-3 py-2 text-left font-medium">
                        Created
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {deployments.map(dep => (
                      <tr key={dep.id} className="border-b last:border-0">
                        <td className="px-3 py-2">{dep.provider}</td>
                        <td className="px-3 py-2">
                          <Badge variant={statusVariant(dep.status)}>
                            {dep.status}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
                          {dep.url ? (
                            <a
                              href={dep.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary hover:underline"
                            >
                              open
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {dep.subdomain ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {formatDateTime(dep.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </section>

      <section id="preview" className="space-y-4">
        <h2 className="text-xl font-semibold">Preview</h2>
        <p className="text-sm text-muted-foreground">
          Admin preview runs in sandboxed mode.
        </p>
        {project.previewUrl ? (
          <Card>
            <CardContent className="p-0">
              <iframe
                title="Project preview"
                src={project.previewUrl}
                className="h-[480px] w-full rounded-lg border"
                sandbox="allow-scripts allow-same-origin"
              />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-8 text-sm text-muted-foreground">
              No preview URL available.
            </CardContent>
          </Card>
        )}
        {project.deploymentUrl ? (
          <p className="text-sm">
            Deployment:{' '}
            <a
              href={project.deploymentUrl}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              {project.deploymentUrl}
            </a>
          </p>
        ) : null}
      </section>

      <section id="costs" className="space-y-4">
        <h2 className="text-xl font-semibold">Costs</h2>
        {costs ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Generations
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold">
                {costs.generations}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Tokens
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold">
                {costs.tokens.toLocaleString()}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Cost
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold">
                {formatCurrency(costs.costUsd)}
              </CardContent>
            </Card>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No cost data.</p>
        )}
        {exportsList.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Exports</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="px-3 py-2 text-left font-medium">Type</th>
                      <th className="px-3 py-2 text-left font-medium">
                        Status
                      </th>
                      <th className="px-3 py-2 text-left font-medium">URL</th>
                      <th className="px-3 py-2 text-left font-medium">
                        Created
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {exportsList.map(exp => (
                      <tr key={exp.id} className="border-b last:border-0">
                        <td className="px-3 py-2">{exp.exportType}</td>
                        <td className="px-3 py-2">
                          <Badge variant={statusVariant(exp.status)}>
                            {exp.status}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
                          {exp.fileUrl ? (
                            <a
                              href={exp.fileUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary hover:underline"
                            >
                              download
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {formatDateTime(exp.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </section>

      <section id="errors" className="space-y-4">
        <h2 className="text-xl font-semibold">Errors</h2>
        {errors.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No build errors recorded.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Code</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">Repairs</th>
                  <th className="px-3 py-2 text-left font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {errors.map(err => (
                  <tr key={err.id} className="border-b last:border-0">
                    <td className="px-3 py-2 font-mono text-xs">
                      {err.errorCode ?? '—'}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={statusVariant(err.status)}>
                        {err.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {err.repairAttempts}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {formatDateTime(err.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section id="security" className="space-y-4">
        <h2 className="text-xl font-semibold">Security</h2>
        <p className="text-sm text-muted-foreground">
          Flags raised by the build sandbox and content scanners.
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[
            { key: 'externalScripts', label: 'External scripts' },
            { key: 'suspiciousLinks', label: 'Suspicious links' },
            { key: 'credentialForms', label: 'Credential forms' },
            { key: 'obfuscatedCode', label: 'Obfuscated code' },
            { key: 'dangerousBrowserApis', label: 'Dangerous browser APIs' },
            { key: 'hiddenRedirects', label: 'Hidden redirects' }
          ].map(flag => {
            const enabled = Boolean(security[flag.key as keyof typeof security])
            return (
              <Card key={flag.key}>
                <CardContent className="flex items-center justify-between py-4">
                  <p className="font-medium">{flag.label}</p>
                  <Badge variant={enabled ? 'destructive' : 'outline'}>
                    {enabled ? 'flagged' : 'clean'}
                  </Badge>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </section>
    </div>
  )
}
