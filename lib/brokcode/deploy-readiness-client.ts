import type { GeneratedBrokCodeQualityReport } from './generated-files'

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
  quality: GeneratedBrokCodeQualityReport
  requiredFiles: string[]
}

export type BrokCodeDeployReadinessDeployment = {
  id: string
  provider: string
  status: string
  url?: string | null
  createdAt?: string | Date | null
  updatedAt?: string | Date | null
}

export type BrokCodeDeployReadinessSummary = {
  label: string
  tone: 'ready' | 'blocked' | 'checking' | 'idle'
  detail: string
}

export function summarizeBrokCodeDeployReadiness({
  error,
  hasProject,
  latestDeployment,
  loading,
  readiness
}: {
  error?: string | null
  hasProject: boolean
  latestDeployment?: BrokCodeDeployReadinessDeployment | null
  loading: boolean
  readiness?: BrokCodeManagedDeployReadiness | null
}): BrokCodeDeployReadinessSummary {
  if (!hasProject) {
    return {
      label: 'No project',
      tone: 'idle',
      detail: 'Create or select a BrokCode project before deploying.'
    }
  }

  if (loading) {
    return {
      label: 'Checking',
      tone: 'checking',
      detail: 'Inspecting saved files and deployment history.'
    }
  }

  if (error) {
    return {
      label: 'Refresh needed',
      tone: 'blocked',
      detail: error
    }
  }

  if (!readiness) {
    return {
      label: 'Not checked',
      tone: 'idle',
      detail: 'Refresh deploy readiness before publishing.'
    }
  }

  if (!readiness.ready) {
    return {
      label:
        readiness.status === 'missing_entrypoint'
          ? 'Missing app'
          : 'Quality gate',
      tone: 'blocked',
      detail: readiness.message
    }
  }

  if (latestDeployment?.status === 'deployed') {
    return {
      label: 'Live',
      tone: 'ready',
      detail: 'Latest managed deployment is live.'
    }
  }

  return {
    label: 'Ready',
    tone: 'ready',
    detail: readiness.message
  }
}
