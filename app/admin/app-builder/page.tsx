import Link from 'next/link'

import {
  getAllAppProjectsForAdmin,
  getAppBuildsForAdmin,
  getAppCostsForAdmin,
  getAppErrorsForAdmin,
  getAppGenerationsForAdmin
} from '@/lib/actions/admin-appbuilder'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

const SUBPAGE_LINKS = [
  { href: '/admin/app-builder/projects', label: 'Projects' },
  { href: '/admin/app-builder/generations', label: 'Generations' },
  { href: '/admin/app-builder/files', label: 'Files' },
  { href: '/admin/app-builder/builds', label: 'Builds' },
  { href: '/admin/app-builder/errors', label: 'Errors' },
  { href: '/admin/app-builder/costs', label: 'Costs' }
] as const

function formatCompact(value: number) {
  return new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(value)
}

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

export default async function AdminAppBuilderPage() {
  const [projects, generations, builds, errors, costs] = await Promise.all([
    getAllAppProjectsForAdmin(),
    getAppGenerationsForAdmin(),
    getAppBuildsForAdmin(),
    getAppErrorsForAdmin(),
    getAppCostsForAdmin()
  ])

  const totalGenerations = generations.length
  const totalCost = costs.reduce((sum, c) => sum + c.costUsd, 0)
  const totalTokens = costs.reduce((sum, c) => sum + c.tokens, 0)
  const errorCount = errors.length
  const activeProjects = projects.filter(
    p => p.status !== 'deleted' && p.status !== 'suspended'
  ).length
  const runningBuilds = builds.filter(
    b => b.status === 'running' || b.status === 'queued'
  ).length

  return (
    <div className="space-y-8 px-4 pb-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold">App Builder Admin</h1>
          <p className="text-muted-foreground">
            Every Lovable / Dyad-style app project generated inside Brok.
            Monitor projects, prompts, files, builds, previews, and costs.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {SUBPAGE_LINKS.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active projects
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeProjects}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {projects.length} total tracked
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Generations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCompact(totalGenerations)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Across all projects
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Tokens used
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCompact(totalTokens)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              All-time generation tokens
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total cost
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(totalCost)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {errorCount} failed builds · {runningBuilds} running
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent projects</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Project</th>
                  <th className="px-3 py-2 text-left font-medium">Workspace</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Generations
                  </th>
                  <th className="px-3 py-2 text-right font-medium">Cost</th>
                  <th className="px-3 py-2 text-left font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {projects.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-3 py-6 text-center text-muted-foreground"
                    >
                      No app projects yet
                    </td>
                  </tr>
                ) : (
                  projects.slice(0, 10).map(project => (
                    <tr key={project.id} className="border-b last:border-0">
                      <td className="px-3 py-2 font-medium">
                        <Link
                          href={`/admin/app-builder/projects/${project.id}`}
                          className="hover:underline"
                        >
                          {project.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {project.slug}
                        </p>
                      </td>
                      <td className="px-3 py-2">{project.workspaceName}</td>
                      <td className="px-3 py-2">
                        <Badge variant={statusVariant(project.status)}>
                          {project.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {project.generationCount}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatCurrency(project.costUsd)}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {formatDateTime(project.updatedAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
