import { getBrokCodeManagedDeployReadiness } from '@/lib/brokcode/deploy-readiness'
import {
  buildFallbackGeneratedAppFiles,
  inspectGeneratedBrokCodeAppQuality,
  prepareGeneratedBrokCodeFiles
} from '@/lib/brokcode/generated-files'
import {
  createBrokCodeProject,
  getBrokCodeProject,
  listBrokCodeProjectFiles,
  updateBrokCodeProjectPreview,
  upsertBrokCodeProjectFile
} from '@/lib/brokcode/project-store'

import type { BrokBuildFilePreview, UserVisiblePlan } from './types'

export type PersistBrokBuildProjectOptions = {
  prompt: string
  userPlan: UserVisiblePlan
  workspaceId: string
  userId: string
  request: { headers: Headers; url: string }
  executeBrokCodeBuild?: (input: {
    prompt: string
    projectId: string
    workspaceId: string
    userId: string
    request: { headers: Headers; url: string }
  }) => Promise<{
    preview_url?: unknown
    generated_files?: unknown
    file_changes?: unknown
    runtime?: unknown
    note?: unknown
  }>
}

export type PersistedBrokBuildProject = {
  projectId: string
  previewUrl: string
  deploymentUrl: string | null
  fileCount: number
  files: BrokBuildFilePreview[]
  source: 'brokcode_execute' | 'degraded_fallback'
  degraded: boolean
  message: string
}

function toFilePreview(file: {
  path: string
  content: string
  language?: string | null
}): BrokBuildFilePreview {
  return {
    path: file.path,
    language: file.language,
    size: file.content.length,
    preview: file.content.slice(0, 240)
  }
}

function cloneExecutionHeaders(request: PersistBrokBuildProjectOptions['request']) {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  for (const name of ['authorization', 'cookie', 'x-api-key']) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }
  return headers
}

async function runBrokCodeExecutionForBuild({
  prompt,
  projectId,
  workspaceId,
  userId,
  request,
  executeBrokCodeBuild
}: {
  prompt: string
  projectId: string
  workspaceId: string
  userId: string
  request: PersistBrokBuildProjectOptions['request']
  executeBrokCodeBuild?: PersistBrokBuildProjectOptions['executeBrokCodeBuild']
}) {
  if (executeBrokCodeBuild) {
    return executeBrokCodeBuild({
      prompt,
      projectId,
      workspaceId,
      userId,
      request
    })
  }

  const endpoint = new URL('/api/brokcode/execute', request.url)
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: cloneExecutionHeaders(request),
    body: JSON.stringify({
      command: prompt,
      project_id: projectId,
      source: 'browser',
      session_id: `build-${projectId}`,
      command_type: 'build',
      allow_brok_fallback: false
    })
  })
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const message =
      typeof payload?.error?.message === 'string'
        ? payload.error.message
        : `BrokCode execution failed with HTTP ${response.status}.`
    throw new Error(message)
  }

  return payload as {
    preview_url?: unknown
    generated_files?: unknown
    file_changes?: unknown
    runtime?: unknown
    note?: unknown
  }
}

export async function persistBrokBuildProject({
  prompt,
  userPlan,
  workspaceId,
  userId,
  request,
  executeBrokCodeBuild
}: PersistBrokBuildProjectOptions): Promise<PersistedBrokBuildProject> {
  const project = await createBrokCodeProject({
    workspaceId,
    userId,
    name: userPlan.title
  })
  const currentFiles = await listBrokCodeProjectFiles({
    projectId: project.id,
    workspaceId
  })
  let executionError: string | null = null
  try {
    const execution = await runBrokCodeExecutionForBuild({
      prompt,
      projectId: project.id,
      workspaceId,
      userId,
      request,
      executeBrokCodeBuild
    })
    const files = await listBrokCodeProjectFiles({
      projectId: project.id,
      workspaceId
    })
    if (files.length === 0) {
      throw new Error('BrokCode execution completed without saving files.')
    }

    const refreshedProject =
      (await getBrokCodeProject({
        id: project.id,
        workspaceId,
        userId
      })) ?? project
    const readiness = getBrokCodeManagedDeployReadiness({
      project: refreshedProject,
      files,
      request
    })
    const previewUrl =
      typeof execution.preview_url === 'string' && execution.preview_url.trim()
        ? execution.preview_url
        : readiness.previewUrl
    const deploymentUrl = null
    const generatedAt = new Date().toISOString()
    const quality = inspectGeneratedBrokCodeAppQuality(files)

    await updateBrokCodeProjectPreview({
      projectId: project.id,
      workspaceId,
      userId,
      previewUrl,
      deploymentUrl,
      status: 'preview_ready',
      metadata: {
        mode: 'managed_static',
        source: 'brok_build_execute',
        prompt,
        fileCount: files.length,
        beforeFileCount: currentFiles.length,
        quality,
        deployReadiness: readiness,
        generatedAt,
        runtime: execution.runtime,
        note: execution.note,
        generatedFiles: execution.generated_files,
        fileChanges: execution.file_changes
      }
    })

    return {
      projectId: project.id,
      previewUrl,
      deploymentUrl,
      fileCount: files.length,
      files: files.map(toFilePreview),
      source: 'brokcode_execute',
      degraded: false,
      message: 'Built through the BrokCode execution runtime.'
    }
  } catch (error) {
    executionError =
      error instanceof Error ? error.message : 'BrokCode execution failed.'
  }

  const files = prepareGeneratedBrokCodeFiles(
    buildFallbackGeneratedAppFiles({
      command: prompt,
      fallbackTitle: userPlan.title
    }),
    { fallbackTitle: userPlan.title }
  )
  const quality = inspectGeneratedBrokCodeAppQuality(files)

  for (const file of files) {
    await upsertBrokCodeProjectFile({
      projectId: project.id,
      workspaceId,
      path: file.path,
      content: file.content,
      language: file.language
    })
  }

  const readiness = getBrokCodeManagedDeployReadiness({
    project,
    files,
    request
  })
  const generatedAt = new Date().toISOString()
  const previewUrl = readiness.previewUrl
  const deploymentUrl = null

  await updateBrokCodeProjectPreview({
    projectId: project.id,
    workspaceId,
    userId,
    previewUrl,
    deploymentUrl,
    status: 'preview_ready',
    metadata: {
      mode: 'degraded_fallback',
      source: 'brok_build_degraded_fallback',
      prompt,
      fileCount: files.length,
      beforeFileCount: currentFiles.length,
      quality,
      deployReadiness: readiness,
      degraded: true,
      executionError,
      generatedAt,
      hotReload: true
    }
  })

  return {
    projectId: project.id,
    previewUrl,
    deploymentUrl,
    fileCount: files.length,
    files: files.map(toFilePreview),
    source: 'degraded_fallback',
    degraded: true,
    message: executionError
      ? `BrokCode execution unavailable: ${executionError}`
      : 'BrokCode execution unavailable; saved a degraded fallback preview.'
  }
}
