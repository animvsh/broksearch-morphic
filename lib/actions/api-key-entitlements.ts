import { hasFeatureAccess } from '@/lib/auth/app-access'
import type { CreateApiKeyInput } from '@/lib/brok/api-platform'

type ApiKeyEntitlementAccess = Parameters<typeof hasFeatureAccess>[0]

export function assertApiKeyEntitlements(
  access: ApiKeyEntitlementAccess,
  input: Pick<CreateApiKeyInput, 'allowedModels' | 'scopes'>
) {
  const needsBrokCode =
    input.scopes.includes('code:write') ||
    input.allowedModels.includes('brok-code')
  if (needsBrokCode && !hasFeatureAccess(access, 'brokcode')) {
    throw new Error('BrokCode access is required to create code-capable keys.')
  }

  const needsTools =
    input.scopes.includes('agents:write') ||
    input.allowedModels.includes('brok-agent')
  if (needsTools && !hasFeatureAccess(access, 'tools')) {
    throw new Error('Tools access is required to create agent-capable keys.')
  }
}
