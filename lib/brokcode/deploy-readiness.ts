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
  metadata?: Record<string, unknown> | null
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
  | 'backend_not_applied'
  | 'backend_not_rewired'
  | 'degraded_fallback'
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function getPreviewMetadata(
  metadata: Record<string, unknown> | null | undefined
) {
  return isRecord(metadata?.preview) ? metadata.preview : null
}

function hasPlannedBackend(
  metadata: Record<string, unknown> | null | undefined
) {
  const preview = getPreviewMetadata(metadata)
  const backendPlan = isRecord(preview?.backendPlan)
    ? preview.backendPlan
    : null

  return (
    backendPlan?.provider === 'insforge' && backendPlan?.status === 'planned'
  )
}

function hasAppliedBackend(
  metadata: Record<string, unknown> | null | undefined
) {
  const preview = getPreviewMetadata(metadata)
  const backendApply = isRecord(preview?.backendApply)
    ? preview.backendApply
    : null

  return (
    backendApply?.provider === 'insforge' && backendApply?.status === 'applied'
  )
}

function hasRewiredBackend(
  metadata: Record<string, unknown> | null | undefined,
  files: DeployReadinessFile[]
) {
  const preview = getPreviewMetadata(metadata)
  const backendRewire = isRecord(preview?.backendRewire)
    ? preview.backendRewire
    : null

  return (
    backendRewire?.provider === 'insforge' &&
    backendRewire?.status === 'rewired' &&
    hasInsForgeBackendUsage(files)
  )
}

export function hasInsForgeBackendUsage(files: DeployReadinessFile[]) {
  const combinedContent = files.map(file => file.content).join('\n')
  if (hasInsForgeSecretUsage(combinedContent)) return false

  return files.some(file => {
    const content = file.content
    const hasPublicInsForgeUrl =
      /\b(?:VITE_|NEXT_PUBLIC_)INSFORGE_URL\b/i.test(content) ||
      /https?:\/\/[^"'`\s>]+insforge[^"'`\s<]*/i.test(content)
    const hasPublicInsForgeAppKey =
      /\b(?:VITE_|NEXT_PUBLIC_)INSFORGE_APP_KEY\b/i.test(content)
    const hasBrowserSafeBackendCall =
      /\b(?:fetch|XMLHttpRequest|axios|createClient)\b/i.test(content) &&
      /\b(?:insforge|\/api\/(?:database|auth|storage|functions))\b/i.test(
        content
      )

    return (
      hasPublicInsForgeUrl &&
      hasPublicInsForgeAppKey &&
      hasBrowserSafeBackendCall
    )
  })
}

function hasInsForgeSecretUsage(content: string) {
  return /\b(?:authorization|x-api-key|INSFORGE_(?:ACCESS|ADMIN|API|PRIVATE|SECRET|SERVICE_ROLE)_KEY|BROKCODE_SHARED_INSFORGE_ADMIN_KEY)\b/i.test(
    content
  )
}

function isDegradedFallback(
  metadata: Record<string, unknown> | null | undefined
) {
  const preview = getPreviewMetadata(metadata)
  return (
    preview?.degraded === true ||
    preview?.mode === 'degraded_fallback' ||
    preview?.source === 'brok_build_degraded_fallback'
  )
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
  const plannedBackend = hasPlannedBackend(project.metadata)

  if (isDegradedFallback(project.metadata)) {
    return {
      ready: false,
      status: 'degraded_fallback',
      strategy: 'managed_live_preview',
      message:
        'BrokCode cannot publish this project yet because it was saved from a degraded fallback preview. Rerun the build with BrokCode runtime execution, then recheck publish readiness.',
      previewUrl,
      deploymentUrl,
      fileCount: files.length,
      quality,
      requiredFiles: []
    }
  }

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

  if (plannedBackend && !hasAppliedBackend(project.metadata)) {
    return {
      ready: false,
      status: 'backend_not_applied',
      strategy: 'managed_live_preview',
      message:
        'BrokCode cannot publish this project yet because its InsForge backend plan has not been applied. Run Backend setup, then recheck publish readiness.',
      previewUrl,
      deploymentUrl,
      fileCount: files.length,
      quality,
      requiredFiles: []
    }
  }

  if (plannedBackend && !hasRewiredBackend(project.metadata, files)) {
    return {
      ready: false,
      status: 'backend_not_rewired',
      strategy: 'managed_live_preview',
      message:
        'BrokCode cannot publish this project yet because its InsForge backend was applied but the app has not been successfully rewired to use it. Rerun Backend setup and require BrokCode execution, then recheck publish readiness.',
      previewUrl,
      deploymentUrl,
      fileCount: files.length,
      quality,
      requiredFiles: []
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
