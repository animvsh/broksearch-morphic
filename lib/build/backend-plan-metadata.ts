import type { BrokBuildBackendResourcePlan } from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function getPersistedBrokBuildBackendPlan(
  metadata: Record<string, unknown> | null | undefined
): BrokBuildBackendResourcePlan | null {
  const preview = isRecord(metadata?.preview) ? metadata.preview : null
  const backendPlan = preview?.backendPlan

  if (!isRecord(backendPlan)) return null

  if (
    backendPlan.provider !== 'insforge' ||
    backendPlan.status !== 'planned' ||
    typeof backendPlan.migrationSql !== 'string'
  ) {
    return null
  }

  return backendPlan as BrokBuildBackendResourcePlan
}
