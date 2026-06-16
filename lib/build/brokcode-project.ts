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

import type {
  BrokBuildBackendResourcePlan,
  BrokBuildFilePreview,
  UserVisiblePlan
} from './types'

export type PersistBrokBuildProjectOptions = {
  prompt: string
  userPlan: UserVisiblePlan
  backendPlan?: BrokBuildBackendResourcePlan
  requireBrokCodeExecution?: boolean
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

async function readBrokCodeExecutionStream(response: Response) {
  if (!response.body) {
    throw new Error('BrokCode execution stream did not include a response body.')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result: {
    preview_url?: unknown
    generated_files?: unknown
    file_changes?: unknown
    runtime?: unknown
    note?: unknown
  } | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split(/\n\n/)
    buffer = events.pop() ?? ''

    for (const eventBlock of events) {
      const lines = eventBlock.split(/\r?\n/)
      const event = lines
        .find(line => line.startsWith('event:'))
        ?.slice(6)
        .trim()
      const data = lines
        .find(line => line.startsWith('data:'))
        ?.slice(5)
        .trim()
      if (!event || !data) continue

      const payload = JSON.parse(data) as {
        message?: unknown
        preview_url?: unknown
        generated_files?: unknown
        file_changes?: unknown
        runtime?: unknown
        note?: unknown
      }
      if (event === 'error') {
        throw new Error(
          typeof payload.message === 'string'
            ? payload.message
            : 'BrokCode execution stream failed.'
        )
      }
      if (event === 'result') {
        result = payload
      }
    }
  }

  if (!result) {
    throw new Error('BrokCode execution stream completed without a result.')
  }

  return result
}

async function runBrokCodeExecutionForBuild({
  prompt,
  userPlan,
  backendPlan,
  projectId,
  workspaceId,
  userId,
  request,
  executeBrokCodeBuild
}: {
  prompt: string
  userPlan: UserVisiblePlan
  backendPlan?: BrokBuildBackendResourcePlan
  projectId: string
  workspaceId: string
  userId: string
  request: PersistBrokBuildProjectOptions['request']
  executeBrokCodeBuild?: PersistBrokBuildProjectOptions['executeBrokCodeBuild']
}) {
  const executionPrompt = buildBrokCodeExecutionPrompt({
    prompt,
    userPlan,
    backendPlan
  })

  if (executeBrokCodeBuild) {
    return executeBrokCodeBuild({
      prompt: executionPrompt,
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
      command: executionPrompt,
      project_id: projectId,
      source: 'browser',
      session_id: `build-${projectId}`,
      command_type: 'build',
      stream: true,
      prefer_pi: true,
      pi_no_tools: 'all',
      pi_scratch_cwd: true,
      allow_brok_fallback: false
    })
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    const message =
      typeof payload?.error?.message === 'string'
        ? payload.error.message
        : `BrokCode execution failed with HTTP ${response.status}.`
    throw new Error(message)
  }

  return readBrokCodeExecutionStream(response)
}

function buildBrokCodeExecutionPrompt({
  prompt,
  userPlan,
  backendPlan
}: {
  prompt: string
  userPlan: UserVisiblePlan
  backendPlan?: BrokBuildBackendResourcePlan
}) {
  const tables =
    backendPlan?.tables.map(table => table.name).filter(Boolean) ?? []
  const buckets =
    backendPlan?.storageBuckets.map(bucket => bucket.name).filter(Boolean) ?? []
  const functions =
    backendPlan?.functions.map(fn => fn.slug).filter(Boolean) ?? []

  return [
    `Create a polished ${userPlan.title} app prototype.`,
    'Return named files for index.html, styles.css, and app.js.',
    '',
    `Original user request: ${prompt}`,
    `Use this positioning: ${userPlan.oneLiner}`,
    `Audience: ${userPlan.audience}.`,
    `Visual direction: ${userPlan.designDirection}`,
    '',
    'Acceptance requirements for this generated app:',
    '- Save these files: index.html, styles.css, app.js.',
    '- The page must be responsive, nonblank, and interactive without external services.',
    '- Include realistic sample data and visible UI states for the planned backend resources.',
    '- Do not install packages, start servers, use shell commands, or create framework scaffolds.',
    '- Write the complete file contents in your final answer with clear filename headings.',
    '- Keep the implementation concise enough to finish in one BrokCode run.',
    '',
    'Required visible product features:',
    ...userPlan.bullets.slice(0, 10).map(bullet => `- ${bullet}`),
    '',
    'Backend resources to reflect in UI labels, sample data, and copy:',
    `- Provider: ${backendPlan?.provider ?? 'insforge'}`,
    `- Tables: ${tables.length ? tables.join(', ') : 'none'}`,
    `- Storage buckets: ${buckets.length ? buckets.join(', ') : 'none'}`,
    `- Functions: ${functions.length ? functions.join(', ') : 'none'}`
  ].join('\n')
}

export async function persistBrokBuildProject({
  prompt,
  userPlan,
  backendPlan,
  requireBrokCodeExecution = false,
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
      userPlan,
      backendPlan,
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
        backendProvider: backendPlan?.provider,
        backendPlanStatus: backendPlan?.status,
        backendPlan,
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
    if (requireBrokCodeExecution) {
      throw new Error(
        `BrokCode execution required for Brok Build but failed: ${executionError}`
      )
    }
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
      backendProvider: backendPlan?.provider,
      backendPlanStatus: backendPlan?.status,
      backendPlan,
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
