import {
  APP_FEATURES,
  AppFeature,
  normalizeAppFeatures
} from '@/lib/auth/app-access'

export type AppAccessFeatureGrant = AppFeature[] | null

export function normalizeEmailForAllowlist(email: string) {
  return email.trim().toLowerCase()
}

export function parseAllowlistFeatureGrant(
  formData: FormData
): AppAccessFeatureGrant {
  const scope = String(formData.get('featureScope') ?? '').trim()
  if (scope === 'all') {
    return null
  }

  const selected = formData
    .getAll('features')
    .map(value => String(value))
    .filter((value): value is AppFeature =>
      APP_FEATURES.includes(value as AppFeature)
    )

  const features = normalizeAppFeatures(selected)

  if (features.length === APP_FEATURES.length) {
    return null
  }

  if (features.length === 0) {
    throw new Error('Choose at least one feature or select all tools')
  }

  return features
}
