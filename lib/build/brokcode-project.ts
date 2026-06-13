import { getBrokCodeManagedDeployReadiness } from '@/lib/brokcode/deploy-readiness'
import {
  buildFallbackGeneratedAppFiles,
  inspectGeneratedBrokCodeAppQuality,
  prepareGeneratedBrokCodeFiles
} from '@/lib/brokcode/generated-files'
import {
  createBrokCodeProject,
  listBrokCodeProjectFiles,
  recordBrokCodeProjectDeployment,
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
}

export type PersistedBrokBuildProject = {
  projectId: string
  previewUrl: string
  deploymentUrl: string
  fileCount: number
  files: BrokBuildFilePreview[]
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

export async function persistBrokBuildProject({
  prompt,
  userPlan,
  workspaceId,
  userId,
  request
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
  const deploymentUrl = readiness.deploymentUrl

  await updateBrokCodeProjectPreview({
    projectId: project.id,
    workspaceId,
    userId,
    previewUrl,
    deploymentUrl,
    status: readiness.ready ? 'deployed' : 'preview_ready',
    metadata: {
      mode: readiness.strategy,
      source: 'brok_build',
      prompt,
      fileCount: files.length,
      beforeFileCount: currentFiles.length,
      quality,
      deployReadiness: readiness,
      generatedAt,
      hotReload: true
    }
  })

  if (readiness.ready) {
    await recordBrokCodeProjectDeployment({
      projectId: project.id,
      workspaceId,
      userId,
      provider: 'managed_preview',
      status: 'deployed',
      url: deploymentUrl,
      subdomain: project.username ?? project.slug,
      metadata: {
        source: 'brok_build',
        previewUrl,
        fileCount: files.length,
        quality,
        deployReadiness: readiness,
        generatedAt
      }
    })
  }

  return {
    projectId: project.id,
    previewUrl,
    deploymentUrl,
    fileCount: files.length,
    files: files.map(toFilePreview)
  }
}
