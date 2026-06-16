import {
  AppAccessResult,
  AppFeature,
  hasFeatureAccess
} from '@/lib/auth/app-access'

const BROKCODE_TASK_KIND = 'brokcode'

export function getRequiredFeatureForTaskKind(kind: string): AppFeature {
  return kind === BROKCODE_TASK_KIND ? 'brokcode' : 'search'
}

export function canAccessTaskKind(
  access: AppAccessResult,
  kind: string
): boolean {
  return hasFeatureAccess(access, getRequiredFeatureForTaskKind(kind))
}

export function getTaskFeatureDeniedBody(kind: string) {
  return {
    error: 'Feature access denied',
    feature: getRequiredFeatureForTaskKind(kind)
  }
}
