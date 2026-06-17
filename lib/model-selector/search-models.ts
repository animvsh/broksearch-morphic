import { BROK_MODELS, getBrokProviderModelId } from '@/lib/brok/models'
import type { Model } from '@/lib/types/models'

export const SEARCH_MODEL_PROVIDER_ID = 'openai-compatible'

export function isSupportedSearchModel(
  model: Pick<Model, 'id' | 'providerId'>
) {
  if (model.providerId !== SEARCH_MODEL_PROVIDER_ID) {
    return false
  }

  const publicModel = BROK_MODELS[model.id]
  if (publicModel) {
    return publicModel.supportsSearch
  }

  const providerModelId = getBrokProviderModelId(model.id)
  return providerModelId
    ? BROK_MODELS[providerModelId]?.supportsSearch === true
    : false
}

export function filterSearchModelsByProvider(
  modelsByProvider: Record<string, Model[]>
): Record<string, Model[]> {
  const filtered = Object.fromEntries(
    Object.entries(modelsByProvider)
      .map(([provider, models]) => [
        provider,
        models.filter(isSupportedSearchModel)
      ])
      .filter(([, models]) => models.length > 0)
  ) as Record<string, Model[]>

  return filtered
}
