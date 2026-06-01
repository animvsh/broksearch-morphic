import { inspectGeneratedBrokCodeAppQuality } from '@/lib/brokcode/generated-files'
import {
  hasRenderableManagedPreview,
  makeManagedDeploymentUrl,
  makeManagedPreviewUrl,
  resolvePublicPreviewOrigin
} from '@/lib/brokcode/preview'

type DeployReadinessProject = {
  id: string
  name: string
  slug?: string | null
  username?: string | null
  updatedAt?: Date | string | null
}

type DeployReadinessFile = {
  path: string
  content: string
  language?: string | null
  updatedAt?: Date | string | null
}

export type BrokCodeManagedDeployReadinessStatus =
  | 'ready'
  | 'missing_entrypoint'
  | 'quality_blocked'

export type BrokCodeManagedDeployReadiness = {
  ready: boolean
  status: BrokCodeManagedDeployReadinessStatus
  message: string
  strategy: 'managed_live_preview'
  previewUrl: string
  deploymentUrl: string
  fileCount: number
  quality: ReturnType<typeof inspectGeneratedBrokCodeAppQuality>
  requiredFiles: string[]
}

export function getBrokCodeManagedDeployReadiness({
  files,
  project,
  request
}: {
  files: DeployReadinessFile[]
  project: DeployReadinessProject
  request: { headers: Headers; url: string }
}): BrokCodeManagedDeployReadiness {
  const origin = resolvePublicPreviewOrigin(request)
  const previewUrl = makeManagedPreviewUrl({
    origin,
    projectId: project.id
  })
  const deploymentUrl = makeManagedDeploymentUrl({
    origin,
    project
  })
  const quality = inspectGeneratedBrokCodeAppQuality(
    files.map(file => ({
      ...file,
      language: file.language ?? null
    }))
  )
  const hasEntrypoint = hasRenderableManagedPreview(files)

  if (!hasEntrypoint) {
    return {
      ready: false,
      status: 'missing_entrypoint',
      strategy: 'managed_live_preview',
      message:
        'BrokCode cannot publish this project yet because it does not have a renderable index.html. Ask BrokCode to build a static app first.',
      previewUrl,
      deploymentUrl,
      fileCount: files.length,
      quality,
      requiredFiles: ['index.html']
    }
  }

  if (quality.issues.length > 0) {
    return {
      ready: false,
      status: 'quality_blocked',
      strategy: 'managed_live_preview',
      message: `BrokCode cannot publish this project until the generated app quality gate passes: ${quality.issues.join(', ')}.`,
      previewUrl,
      deploymentUrl,
      fileCount: files.length,
      quality,
      requiredFiles: []
    }
  }

  return {
    ready: true,
    status: 'ready',
    strategy: 'managed_live_preview',
    message: 'BrokCode app is ready to publish on its managed URL.',
    previewUrl,
    deploymentUrl,
    fileCount: files.length,
    quality,
    requiredFiles: []
  }
}
