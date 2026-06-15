'use server'

import { revalidatePath } from 'next/cache'

import { and, desc, eq, inArray, sql } from 'drizzle-orm'

import { requireAdminAccess } from '@/lib/auth/admin'
import { db } from '@/lib/db'
import { canUseDevDbFallback } from '@/lib/db/dev-db-fallback'
import {
  brokCodeBuilds,
  brokCodeDeployments,
  brokCodeExports,
  brokCodeGenerations,
  brokCodeProjectFiles,
  brokCodeProjects,
  brokCodeRuntimeSandboxes,
  brokCodeVersions,
  workspaces
} from '@/lib/db/schema'

async function assertAdminAccess() {
  const access = await requireAdminAccess()
  if (!access.ok) {
    throw new Error(access.error)
  }
}

function asNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0
  const parsed = typeof value === 'string' ? Number(value) : value
  return Number.isFinite(parsed) ? parsed : 0
}

function asDate(value: Date | string | null | undefined): Date {
  if (value instanceof Date) return value
  if (!value) return new Date(0)
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed
}

function revalidateAppBuilderPaths(projectId?: string) {
  revalidatePath('/admin/app-builder')
  revalidatePath('/admin/app-builder/projects')
  revalidatePath('/admin/app-builder/generations')
  revalidatePath('/admin/app-builder/files')
  revalidatePath('/admin/app-builder/builds')
  revalidatePath('/admin/app-builder/errors')
  revalidatePath('/admin/app-builder/costs')
  if (projectId) {
    revalidatePath(`/admin/app-builder/projects/${projectId}`)
  }
}

export type AdminAppProjectRow = {
  id: string
  name: string
  slug: string
  username: string | null
  ownerId: string
  ownerEmail: string
  workspaceId: string
  workspaceName: string
  status: string
  buildStatus: string
  fileCount: number
  generationCount: number
  previewUrl: string | null
  deploymentUrl: string | null
  tokensUsed: number
  costUsd: number
  createdAt: Date
  updatedAt: Date
}

export async function getAllAppProjectsForAdmin(): Promise<
  AdminAppProjectRow[]
> {
  await assertAdminAccess()

  try {
    const rows = await db
      .select({
        id: brokCodeProjects.id,
        name: brokCodeProjects.name,
        slug: brokCodeProjects.slug,
        username: brokCodeProjects.username,
        ownerId: brokCodeProjects.userId,
        workspaceId: brokCodeProjects.workspaceId,
        workspaceName: workspaces.name,
        status: brokCodeProjects.status,
        previewUrl: brokCodeProjects.previewUrl,
        deploymentUrl: brokCodeProjects.deploymentUrl,
        createdAt: brokCodeProjects.createdAt,
        updatedAt: brokCodeProjects.updatedAt
      })
      .from(brokCodeProjects)
      .leftJoin(workspaces, eq(brokCodeProjects.workspaceId, workspaces.id))
      .orderBy(desc(brokCodeProjects.updatedAt))

    if (rows.length === 0) return []

    const projectIds = rows.map(r => r.id)

    const fileCounts = await db
      .select({
        projectId: brokCodeProjectFiles.projectId,
        count: sql<number>`count(*)::int`
      })
      .from(brokCodeProjectFiles)
      .where(inArray(brokCodeProjectFiles.projectId, projectIds))
      .groupBy(brokCodeProjectFiles.projectId)

    const generationCounts = await db
      .select({
        projectId: brokCodeGenerations.projectId,
        count: sql<number>`count(*)::int`,
        totalCost: sql<string>`coalesce(sum(${brokCodeGenerations.costUsd}), 0)`,
        totalInput: sql<number>`coalesce(sum(${brokCodeGenerations.inputTokens}), 0)::int`,
        totalOutput: sql<number>`coalesce(sum(${brokCodeGenerations.outputTokens}), 0)::int`
      })
      .from(brokCodeGenerations)
      .where(inArray(brokCodeGenerations.projectId, projectIds))
      .groupBy(brokCodeGenerations.projectId)

    const latestSandbox = await db
      .select({
        projectId: brokCodeRuntimeSandboxes.projectId,
        status: brokCodeRuntimeSandboxes.status
      })
      .from(brokCodeRuntimeSandboxes)
      .where(inArray(brokCodeRuntimeSandboxes.projectId, projectIds))
      .orderBy(desc(brokCodeRuntimeSandboxes.updatedAt))

    const fileCountByProject = new Map(
      fileCounts.map(f => [f.projectId, Number(f.count) || 0])
    )
    const generationByProject = new Map(
      generationCounts.map(g => [
        g.projectId,
        {
          count: Number(g.count) || 0,
          totalCost: asNumber(g.totalCost),
          totalInput: Number(g.totalInput) || 0,
          totalOutput: Number(g.totalOutput) || 0
        }
      ])
    )
    const sandboxStatusByProject = new Map<string, string>()
    for (const row of latestSandbox) {
      if (!sandboxStatusByProject.has(row.projectId)) {
        sandboxStatusByProject.set(row.projectId, row.status)
      }
    }

    return rows.map(row => {
      const stats = generationByProject.get(row.id)
      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        username: row.username,
        ownerId: row.ownerId,
        ownerEmail: row.ownerId,
        workspaceId: row.workspaceId,
        workspaceName: row.workspaceName ?? 'Unknown',
        status: row.status,
        buildStatus: sandboxStatusByProject.get(row.id) ?? 'idle',
        fileCount: fileCountByProject.get(row.id) ?? 0,
        generationCount: stats?.count ?? 0,
        previewUrl: row.previewUrl,
        deploymentUrl: row.deploymentUrl,
        tokensUsed: (stats?.totalInput ?? 0) + (stats?.totalOutput ?? 0),
        costUsd: stats?.totalCost ?? 0,
        createdAt: asDate(row.createdAt),
        updatedAt: asDate(row.updatedAt)
      }
    })
  } catch (error) {
    if (canUseDevDbFallback(error)) return []
    throw error
  }
}

export type AdminAppProjectDetail = AdminAppProjectRow & {
  framework: string
  dependencies: string[]
  initialPrompt: string
  lastBuildStatus: string
}

export async function getAppProjectForAdmin(
  projectId: string
): Promise<AdminAppProjectDetail | null> {
  await assertAdminAccess()

  try {
    const [project] = await db
      .select({
        id: brokCodeProjects.id,
        name: brokCodeProjects.name,
        slug: brokCodeProjects.slug,
        username: brokCodeProjects.username,
        ownerId: brokCodeProjects.userId,
        workspaceId: brokCodeProjects.workspaceId,
        workspaceName: workspaces.name,
        status: brokCodeProjects.status,
        previewUrl: brokCodeProjects.previewUrl,
        deploymentUrl: brokCodeProjects.deploymentUrl,
        createdAt: brokCodeProjects.createdAt,
        updatedAt: brokCodeProjects.updatedAt,
        metadata: brokCodeProjects.metadata
      })
      .from(brokCodeProjects)
      .leftJoin(workspaces, eq(brokCodeProjects.workspaceId, workspaces.id))
      .where(eq(brokCodeProjects.id, projectId))
      .limit(1)

    if (!project) return null

    const [fileStats] = await db
      .select({
        count: sql<number>`count(*)::int`
      })
      .from(brokCodeProjectFiles)
      .where(eq(brokCodeProjectFiles.projectId, projectId))

    const [generationStats] = await db
      .select({
        count: sql<number>`count(*)::int`,
        totalCost: sql<string>`coalesce(sum(${brokCodeGenerations.costUsd}), 0)`,
        totalInput: sql<number>`coalesce(sum(${brokCodeGenerations.inputTokens}), 0)::int`,
        totalOutput: sql<number>`coalesce(sum(${brokCodeGenerations.outputTokens}), 0)::int`
      })
      .from(brokCodeGenerations)
      .where(eq(brokCodeGenerations.projectId, projectId))

    const [latestSandbox] = await db
      .select({ status: brokCodeRuntimeSandboxes.status })
      .from(brokCodeRuntimeSandboxes)
      .where(eq(brokCodeRuntimeSandboxes.projectId, projectId))
      .orderBy(desc(brokCodeRuntimeSandboxes.updatedAt))
      .limit(1)

    const metadata = (project.metadata ?? {}) as Record<string, unknown>
    const framework =
      typeof metadata.framework === 'string' ? metadata.framework : 'react'
    const dependencies = Array.isArray(metadata.dependencies)
      ? (metadata.dependencies as unknown[]).map(d => String(d))
      : []
    const initialPrompt =
      typeof metadata.initialPrompt === 'string' ? metadata.initialPrompt : ''

    const stats = {
      count: Number(generationStats?.count) || 0,
      totalCost: asNumber(generationStats?.totalCost),
      totalInput: Number(generationStats?.totalInput) || 0,
      totalOutput: Number(generationStats?.totalOutput) || 0
    }

    return {
      id: project.id,
      name: project.name,
      slug: project.slug,
      username: project.username,
      ownerId: project.ownerId,
      ownerEmail: project.ownerId,
      workspaceId: project.workspaceId,
      workspaceName: project.workspaceName ?? 'Unknown',
      status: project.status,
      buildStatus: latestSandbox?.status ?? 'idle',
      fileCount: Number(fileStats?.count) || 0,
      generationCount: stats.count,
      previewUrl: project.previewUrl,
      deploymentUrl: project.deploymentUrl,
      tokensUsed: stats.totalInput + stats.totalOutput,
      costUsd: stats.totalCost,
      createdAt: asDate(project.createdAt),
      updatedAt: asDate(project.updatedAt),
      framework,
      dependencies,
      initialPrompt,
      lastBuildStatus: latestSandbox?.status ?? 'idle'
    }
  } catch (error) {
    if (canUseDevDbFallback(error)) return null
    throw error
  }
}

export type AdminAppGenerationRow = {
  id: string
  projectId: string
  projectName: string
  workspaceName: string
  ownerId: string
  prompt: string
  model: string
  inputTokens: number
  outputTokens: number
  costUsd: number
  filesChanged: string[]
  buildResult: string | null
  status: string
  errorCode: string | null
  createdAt: Date
}

export async function getAppGenerationsForAdmin(
  projectId?: string
): Promise<AdminAppGenerationRow[]> {
  await assertAdminAccess()

  try {
    const baseQuery = db
      .select({
        id: brokCodeGenerations.id,
        projectId: brokCodeGenerations.projectId,
        projectName: brokCodeProjects.name,
        workspaceName: workspaces.name,
        ownerId: brokCodeGenerations.userId,
        prompt: brokCodeGenerations.prompt,
        model: brokCodeGenerations.model,
        inputTokens: brokCodeGenerations.inputTokens,
        outputTokens: brokCodeGenerations.outputTokens,
        costUsd: brokCodeGenerations.costUsd,
        filesChanged: brokCodeGenerations.filesChanged,
        buildResult: brokCodeGenerations.buildResult,
        status: brokCodeGenerations.status,
        errorCode: brokCodeGenerations.errorCode,
        createdAt: brokCodeGenerations.createdAt
      })
      .from(brokCodeGenerations)
      .leftJoin(
        brokCodeProjects,
        eq(brokCodeGenerations.projectId, brokCodeProjects.id)
      )
      .leftJoin(workspaces, eq(brokCodeGenerations.workspaceId, workspaces.id))
      .orderBy(desc(brokCodeGenerations.createdAt))
      .limit(500)

    const rows = projectId
      ? await baseQuery.where(eq(brokCodeGenerations.projectId, projectId))
      : await baseQuery

    return rows.map(row => ({
      id: row.id,
      projectId: row.projectId,
      projectName: row.projectName ?? 'Unknown',
      workspaceName: row.workspaceName ?? 'Unknown',
      ownerId: row.ownerId,
      prompt: row.prompt,
      model: row.model,
      inputTokens: Number(row.inputTokens) || 0,
      outputTokens: Number(row.outputTokens) || 0,
      costUsd: asNumber(row.costUsd),
      filesChanged: Array.isArray(row.filesChanged)
        ? (row.filesChanged as unknown[]).map(v => String(v))
        : [],
      buildResult: row.buildResult,
      status: row.status,
      errorCode: row.errorCode,
      createdAt: asDate(row.createdAt)
    }))
  } catch (error) {
    if (canUseDevDbFallback(error)) return []
    throw error
  }
}

export type AdminAppFileRow = {
  id: string
  projectId: string
  projectName: string
  workspaceName: string
  path: string
  language: string | null
  sizeBytes: number
  updatedAt: Date
}

export async function getAppProjectFilesForAdmin(
  projectId?: string
): Promise<AdminAppFileRow[]> {
  await assertAdminAccess()

  try {
    const baseQuery = db
      .select({
        id: brokCodeProjectFiles.id,
        projectId: brokCodeProjectFiles.projectId,
        projectName: brokCodeProjects.name,
        workspaceName: workspaces.name,
        path: brokCodeProjectFiles.path,
        language: brokCodeProjectFiles.language,
        content: brokCodeProjectFiles.content,
        updatedAt: brokCodeProjectFiles.updatedAt
      })
      .from(brokCodeProjectFiles)
      .leftJoin(
        brokCodeProjects,
        eq(brokCodeProjectFiles.projectId, brokCodeProjects.id)
      )
      .leftJoin(workspaces, eq(brokCodeProjectFiles.workspaceId, workspaces.id))
      .orderBy(desc(brokCodeProjectFiles.updatedAt))
      .limit(500)

    const rows = projectId
      ? await baseQuery.where(eq(brokCodeProjectFiles.projectId, projectId))
      : await baseQuery

    return rows.map(row => ({
      id: row.id,
      projectId: row.projectId,
      projectName: row.projectName ?? 'Unknown',
      workspaceName: row.workspaceName ?? 'Unknown',
      path: row.path,
      language: row.language,
      sizeBytes: row.content?.length ?? 0,
      updatedAt: asDate(row.updatedAt)
    }))
  } catch (error) {
    if (canUseDevDbFallback(error)) return []
    throw error
  }
}

export type AdminAppBuildRow = {
  id: string
  projectId: string
  projectName: string
  workspaceName: string
  status: string
  finalStatus: string | null
  durationMs: number
  repairAttempts: number
  buildCommand: string | null
  installCommand: string | null
  typeErrorCount: number
  viteErrorCount: number
  errorCode: string | null
  createdAt: Date
  updatedAt: Date
}

export async function getAppBuildsForAdmin(
  projectId?: string
): Promise<AdminAppBuildRow[]> {
  await assertAdminAccess()

  try {
    const baseQuery = db
      .select({
        id: brokCodeBuilds.id,
        projectId: brokCodeBuilds.projectId,
        projectName: brokCodeProjects.name,
        workspaceName: workspaces.name,
        status: brokCodeBuilds.status,
        finalStatus: brokCodeBuilds.finalStatus,
        durationMs: brokCodeBuilds.durationMs,
        repairAttempts: brokCodeBuilds.repairAttempts,
        buildCommand: brokCodeBuilds.buildCommand,
        installCommand: brokCodeBuilds.installCommand,
        typeErrors: brokCodeBuilds.typeErrors,
        viteErrors: brokCodeBuilds.viteErrors,
        errorCode: brokCodeBuilds.errorCode,
        createdAt: brokCodeBuilds.createdAt,
        updatedAt: brokCodeBuilds.updatedAt
      })
      .from(brokCodeBuilds)
      .leftJoin(
        brokCodeProjects,
        eq(brokCodeBuilds.projectId, brokCodeProjects.id)
      )
      .leftJoin(workspaces, eq(brokCodeBuilds.workspaceId, workspaces.id))
      .orderBy(desc(brokCodeBuilds.createdAt))
      .limit(500)

    const rows = projectId
      ? await baseQuery.where(eq(brokCodeBuilds.projectId, projectId))
      : await baseQuery

    return rows.map(row => ({
      id: row.id,
      projectId: row.projectId,
      projectName: row.projectName ?? 'Unknown',
      workspaceName: row.workspaceName ?? 'Unknown',
      status: row.status,
      finalStatus: row.finalStatus,
      durationMs: Number(row.durationMs) || 0,
      repairAttempts: Number(row.repairAttempts) || 0,
      buildCommand: row.buildCommand,
      installCommand: row.installCommand,
      typeErrorCount: Array.isArray(row.typeErrors)
        ? (row.typeErrors as unknown[]).length
        : 0,
      viteErrorCount: Array.isArray(row.viteErrors)
        ? (row.viteErrors as unknown[]).length
        : 0,
      errorCode: row.errorCode,
      createdAt: asDate(row.createdAt),
      updatedAt: asDate(row.updatedAt)
    }))
  } catch (error) {
    if (canUseDevDbFallback(error)) return []
    throw error
  }
}

export type AdminAppErrorRow = AdminAppBuildRow & {
  message: string
}

export async function getAppErrorsForAdmin(
  projectId?: string
): Promise<AdminAppErrorRow[]> {
  const builds = await getAppBuildsForAdmin(projectId)
  return builds
    .filter(build => build.status === 'failed' || build.errorCode)
    .map(build => ({
      ...build,
      message: build.errorCode ?? `Build ${build.status}`
    }))
}

export type AdminAppCostRow = {
  projectId: string
  projectName: string
  workspaceName: string
  ownerId: string
  status: string
  generations: number
  tokens: number
  costUsd: number
  updatedAt: Date
}

export async function getAppCostsForAdmin(): Promise<AdminAppCostRow[]> {
  await assertAdminAccess()

  try {
    const projects = await db
      .select({
        id: brokCodeProjects.id,
        name: brokCodeProjects.name,
        workspaceName: workspaces.name,
        ownerId: brokCodeProjects.userId,
        status: brokCodeProjects.status,
        updatedAt: brokCodeProjects.updatedAt
      })
      .from(brokCodeProjects)
      .leftJoin(workspaces, eq(brokCodeProjects.workspaceId, workspaces.id))
      .orderBy(desc(brokCodeProjects.updatedAt))
      .limit(500)

    if (projects.length === 0) return []

    const projectIds = projects.map(p => p.id)

    const stats = await db
      .select({
        projectId: brokCodeGenerations.projectId,
        count: sql<number>`count(*)::int`,
        totalCost: sql<string>`coalesce(sum(${brokCodeGenerations.costUsd}), 0)`,
        totalInput: sql<number>`coalesce(sum(${brokCodeGenerations.inputTokens}), 0)::int`,
        totalOutput: sql<number>`coalesce(sum(${brokCodeGenerations.outputTokens}), 0)::int`
      })
      .from(brokCodeGenerations)
      .where(inArray(brokCodeGenerations.projectId, projectIds))
      .groupBy(brokCodeGenerations.projectId)

    const statsByProject = new Map(
      stats.map(s => [
        s.projectId,
        {
          count: Number(s.count) || 0,
          totalCost: asNumber(s.totalCost),
          totalInput: Number(s.totalInput) || 0,
          totalOutput: Number(s.totalOutput) || 0
        }
      ])
    )

    return projects.map(project => {
      const s = statsByProject.get(project.id)
      return {
        projectId: project.id,
        projectName: project.name,
        workspaceName: project.workspaceName ?? 'Unknown',
        ownerId: project.ownerId,
        status: project.status,
        generations: s?.count ?? 0,
        tokens: (s?.totalInput ?? 0) + (s?.totalOutput ?? 0),
        costUsd: s?.totalCost ?? 0,
        updatedAt: asDate(project.updatedAt)
      }
    })
  } catch (error) {
    if (canUseDevDbFallback(error)) return []
    throw error
  }
}

export async function refundAppGeneration(formData: FormData) {
  await assertAdminAccess()
  const generationId = String(formData.get('id') ?? '').trim()
  if (!generationId) {
    throw new Error('Generation id is required')
  }

  try {
    await db
      .update(brokCodeGenerations)
      .set({ costUsd: '0' })
      .where(eq(brokCodeGenerations.id, generationId))
  } catch (error) {
    if (!canUseDevDbFallback(error)) throw error
  }

  revalidateAppBuilderPaths()
}

export async function setAppProjectStatus(formData: FormData) {
  await assertAdminAccess()
  const projectId = String(formData.get('id') ?? '').trim()
  const status = String(formData.get('status') ?? '').trim()
  if (!projectId || !status) {
    throw new Error('Project id and status are required')
  }

  try {
    await db
      .update(brokCodeProjects)
      .set({ status, updatedAt: new Date() })
      .where(eq(brokCodeProjects.id, projectId))
  } catch (error) {
    if (!canUseDevDbFallback(error)) throw error
  }

  revalidateAppBuilderPaths(projectId)
}

export async function setAppProjectPreview(formData: FormData) {
  await assertAdminAccess()
  const projectId = String(formData.get('id') ?? '').trim()
  const enabled = formData.get('enabled') === 'true'
  if (!projectId) {
    throw new Error('Project id is required')
  }

  try {
    await db
      .update(brokCodeProjects)
      .set({
        previewUrl: enabled
          ? sql`COALESCE(${brokCodeProjects.previewUrl}, '')`
          : null,
        updatedAt: new Date()
      })
      .where(eq(brokCodeProjects.id, projectId))
  } catch (error) {
    if (!canUseDevDbFallback(error)) throw error
  }

  revalidateAppBuilderPaths(projectId)
}

export async function deleteAppProject(formData: FormData) {
  await assertAdminAccess()
  const projectId = String(formData.get('id') ?? '').trim()
  if (!projectId) {
    throw new Error('Project id is required')
  }

  try {
    await db
      .update(brokCodeProjects)
      .set({ status: 'deleted', updatedAt: new Date() })
      .where(eq(brokCodeProjects.id, projectId))
  } catch (error) {
    if (!canUseDevDbFallback(error)) throw error
  }

  revalidateAppBuilderPaths(projectId)
}

export type AdminAppVersionsForProject = {
  id: string
  projectId: string
  versionId: string
  command: string
  status: string
  runtime: string
  branch: string | null
  commitSha: string | null
  previewUrl: string | null
  createdAt: Date
}

export async function getAppVersionsForProject(
  projectId: string
): Promise<AdminAppVersionsForProject[]> {
  await assertAdminAccess()
  try {
    const rows = await db
      .select({
        id: brokCodeVersions.id,
        sessionId: brokCodeVersions.sessionId,
        projectId: brokCodeVersions.projectId,
        command: brokCodeVersions.command,
        status: brokCodeVersions.status,
        runtime: brokCodeVersions.runtime,
        branch: brokCodeVersions.branch,
        commitSha: brokCodeVersions.commitSha,
        previewUrl: brokCodeVersions.previewUrl,
        createdAt: brokCodeVersions.createdAt
      })
      .from(brokCodeVersions)
      .where(eq(brokCodeVersions.projectId, projectId))
      .orderBy(desc(brokCodeVersions.createdAt))
      .limit(200)

    return rows.map(row => ({
      id: row.id,
      projectId: row.projectId ?? projectId,
      versionId: row.id,
      command: row.command,
      status: row.status,
      runtime: row.runtime,
      branch: row.branch,
      commitSha: row.commitSha,
      previewUrl: row.previewUrl,
      createdAt: asDate(row.createdAt)
    }))
  } catch (error) {
    if (canUseDevDbFallback(error)) return []
    throw error
  }
}

export type AdminAppDeploymentRow = {
  id: string
  projectId: string
  projectName: string
  workspaceName: string
  provider: string
  status: string
  url: string | null
  subdomain: string | null
  createdAt: Date
  updatedAt: Date
}

export async function getAppDeploymentsForProject(
  projectId: string
): Promise<AdminAppDeploymentRow[]> {
  await assertAdminAccess()
  try {
    const rows = await db
      .select({
        id: brokCodeDeployments.id,
        projectId: brokCodeDeployments.projectId,
        projectName: brokCodeProjects.name,
        workspaceName: workspaces.name,
        provider: brokCodeDeployments.provider,
        status: brokCodeDeployments.status,
        url: brokCodeDeployments.url,
        subdomain: brokCodeDeployments.subdomain,
        createdAt: brokCodeDeployments.createdAt,
        updatedAt: brokCodeDeployments.updatedAt
      })
      .from(brokCodeDeployments)
      .leftJoin(
        brokCodeProjects,
        eq(brokCodeDeployments.projectId, brokCodeProjects.id)
      )
      .leftJoin(workspaces, eq(brokCodeDeployments.workspaceId, workspaces.id))
      .where(eq(brokCodeDeployments.projectId, projectId))
      .orderBy(desc(brokCodeDeployments.createdAt))
      .limit(200)

    return rows.map(row => ({
      id: row.id,
      projectId: row.projectId,
      projectName: row.projectName ?? 'Unknown',
      workspaceName: row.workspaceName ?? 'Unknown',
      provider: row.provider,
      status: row.status,
      url: row.url,
      subdomain: row.subdomain,
      createdAt: asDate(row.createdAt),
      updatedAt: asDate(row.updatedAt)
    }))
  } catch (error) {
    if (canUseDevDbFallback(error)) return []
    throw error
  }
}

export async function getAppExportsForProject(projectId: string): Promise<
  Array<{
    id: string
    projectId: string
    exportType: string
    fileUrl: string | null
    status: string
    costUsd: number
    createdAt: Date
  }>
> {
  await assertAdminAccess()
  try {
    const rows = await db
      .select({
        id: brokCodeExports.id,
        projectId: brokCodeExports.projectId,
        exportType: brokCodeExports.exportType,
        fileUrl: brokCodeExports.fileUrl,
        status: brokCodeExports.status,
        costUsd: brokCodeExports.costUsd,
        createdAt: brokCodeExports.createdAt
      })
      .from(brokCodeExports)
      .where(eq(brokCodeExports.projectId, projectId))
      .orderBy(desc(brokCodeExports.createdAt))
      .limit(200)

    return rows.map(row => ({
      id: row.id,
      projectId: row.projectId,
      exportType: row.exportType,
      fileUrl: row.fileUrl,
      status: row.status,
      costUsd: asNumber(row.costUsd),
      createdAt: asDate(row.createdAt)
    }))
  } catch (error) {
    if (canUseDevDbFallback(error)) return []
    throw error
  }
}

export type AdminAppSecurityFlags = {
  externalScripts: boolean
  suspiciousLinks: boolean
  credentialForms: boolean
  obfuscatedCode: boolean
  dangerousBrowserApis: boolean
  hiddenRedirects: boolean
}

export async function getAppSecurityFlagsForProject(
  projectId: string
): Promise<AdminAppSecurityFlags> {
  await assertAdminAccess()
  try {
    const [project] = await db
      .select({ metadata: brokCodeProjects.metadata })
      .from(brokCodeProjects)
      .where(eq(brokCodeProjects.id, projectId))
      .limit(1)
    const meta = (project?.metadata ?? {}) as Record<string, unknown>
    const security = (meta.security ?? {}) as Record<string, unknown>
    return {
      externalScripts: security.externalScripts === true,
      suspiciousLinks: security.suspiciousLinks === true,
      credentialForms: security.credentialForms === true,
      obfuscatedCode: security.obfuscatedCode === true,
      dangerousBrowserApis: security.dangerousBrowserApis === true,
      hiddenRedirects: security.hiddenRedirects === true
    }
  } catch (error) {
    if (canUseDevDbFallback(error)) {
      return {
        externalScripts: false,
        suspiciousLinks: false,
        credentialForms: false,
        obfuscatedCode: false,
        dangerousBrowserApis: false,
        hiddenRedirects: false
      }
    }
    throw error
  }
}
