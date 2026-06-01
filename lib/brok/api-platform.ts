export const API_KEY_ENVIRONMENTS = ['test', 'live'] as const

export const API_KEY_SCOPE_IDS = [
  'chat:write',
  'search:write',
  'code:write',
  'agents:write',
  'usage:read',
  'logs:read'
] as const

export const BROK_API_MODEL_IDS = [
  'brok-fast',
  'brok-lite',
  'brok-search',
  'brok-search-pro',
  'brok-code',
  'brok-agent',
  'brok-reasoning'
] as const

export const API_KEY_LIMITS = {
  nameMaxLength: 80,
  rpmMin: 1,
  rpmMax: 1000,
  dailyMin: 1,
  dailyMax: 100000,
  monthlyBudgetMinCents: 0,
  monthlyBudgetMaxCents: 10000000
} as const

export type ApiKeyEnvironment = (typeof API_KEY_ENVIRONMENTS)[number]
export type ApiKeyScope = (typeof API_KEY_SCOPE_IDS)[number]
export type BrokApiModel = (typeof BROK_API_MODEL_IDS)[number]

export interface CreateApiKeyInput {
  name: string
  environment: ApiKeyEnvironment
  scopes: string[]
  allowedModels: string[]
  rpmLimit: number
  dailyRequestLimit: number
  monthlyBudgetCents: number
}

const apiKeyEnvironmentSet = new Set<string>(API_KEY_ENVIRONMENTS)
const apiKeyScopeSet = new Set<string>(API_KEY_SCOPE_IDS)
const brokApiModelSet = new Set<string>(BROK_API_MODEL_IDS)

function uniqueStringValues(values: unknown, label: string) {
  if (!Array.isArray(values)) {
    throw new Error(`${label} must be an array.`)
  }

  const seen = new Set<string>()
  const normalized: string[] = []

  for (const value of values) {
    if (typeof value !== 'string') {
      throw new Error(`${label} must only contain strings.`)
    }

    const trimmed = value.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    normalized.push(trimmed)
  }

  return normalized
}

function validateIntegerLimit(
  value: unknown,
  label: string,
  min: number,
  max: number
) {
  const numeric = Number(value)

  if (!Number.isInteger(numeric) || numeric < min || numeric > max) {
    throw new Error(`${label} must be an integer between ${min} and ${max}.`)
  }

  return numeric
}

export function validateCreateApiKeyInput(
  input: CreateApiKeyInput
): CreateApiKeyInput {
  if (!input || typeof input !== 'object') {
    throw new Error('API key input is required.')
  }

  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (!name) {
    throw new Error('API key name is required.')
  }

  if (name.length > API_KEY_LIMITS.nameMaxLength) {
    throw new Error(
      `API key name must be ${API_KEY_LIMITS.nameMaxLength} characters or fewer.`
    )
  }

  if (!apiKeyEnvironmentSet.has(input.environment)) {
    throw new Error('API key environment must be test or live.')
  }

  const scopes = uniqueStringValues(input.scopes, 'API key scopes')
  if (scopes.length === 0) {
    throw new Error('Select at least one API key scope.')
  }

  const invalidScopes = scopes.filter(scope => !apiKeyScopeSet.has(scope))
  if (invalidScopes.length > 0) {
    throw new Error(`Unsupported API key scopes: ${invalidScopes.join(', ')}.`)
  }

  const allowedModels = uniqueStringValues(
    input.allowedModels,
    'Allowed models'
  )
  const invalidModels = allowedModels.filter(
    model => !brokApiModelSet.has(model)
  )
  if (invalidModels.length > 0) {
    throw new Error(`Unsupported Brok models: ${invalidModels.join(', ')}.`)
  }

  return {
    name,
    environment: input.environment,
    scopes,
    allowedModels,
    rpmLimit: validateIntegerLimit(
      input.rpmLimit,
      'Requests per minute',
      API_KEY_LIMITS.rpmMin,
      API_KEY_LIMITS.rpmMax
    ),
    dailyRequestLimit: validateIntegerLimit(
      input.dailyRequestLimit,
      'Daily request limit',
      API_KEY_LIMITS.dailyMin,
      API_KEY_LIMITS.dailyMax
    ),
    monthlyBudgetCents: validateIntegerLimit(
      input.monthlyBudgetCents,
      'Monthly budget',
      API_KEY_LIMITS.monthlyBudgetMinCents,
      API_KEY_LIMITS.monthlyBudgetMaxCents
    )
  }
}
