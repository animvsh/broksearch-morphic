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
export type ApiKeyStatus = 'active' | 'paused' | 'revoked'
export type ApiKeyStatusAction = 'pause' | 'resume' | 'revoke'

export type ApiRequestValidationResult =
  | { ok: true }
  | { ok: false; code: string; message: string }

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
const openAiChatMessageRoles = new Set([
  'system',
  'developer',
  'user',
  'assistant',
  'tool'
])
const anthropicMessageRoles = new Set(['user', 'assistant'])
const openAiContentPartTypes = new Set([
  'text',
  'input_text',
  'image_url',
  'input_image'
])
const anthropicContentBlockTypes = new Set(['text', 'tool_use', 'tool_result'])

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

export function validateApiKeyStatusTransition(
  status: ApiKeyStatus,
  action: ApiKeyStatusAction
) {
  if (action === 'pause') {
    if (status === 'paused') {
      throw new Error('API key is already paused.')
    }
    if (status === 'revoked') {
      throw new Error('Revoked API keys cannot be paused.')
    }
    return
  }

  if (action === 'resume') {
    if (status === 'active') {
      throw new Error('API key is already active.')
    }
    if (status === 'revoked') {
      throw new Error('Revoked API keys cannot be resumed. Create a new key.')
    }
    return
  }

  if (status === 'revoked') {
    throw new Error('API key is already revoked.')
  }
}

export function validateOpenAiChatMessages(
  messages: unknown[]
): ApiRequestValidationResult {
  if (messages.length === 0) {
    return {
      ok: false,
      code: 'missing_messages',
      message: 'messages must include at least one chat message.'
    }
  }

  for (const [index, message] of messages.entries()) {
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      return {
        ok: false,
        code: 'invalid_message',
        message: `messages[${index}] must be an object.`
      }
    }

    const role = (message as { role?: unknown }).role
    if (typeof role !== 'string' || !openAiChatMessageRoles.has(role)) {
      return {
        ok: false,
        code: 'invalid_message_role',
        message:
          `messages[${index}].role must be one of ` +
          'system, developer, user, assistant, or tool.'
      }
    }

    const typedMessage = message as Record<string, unknown>
    const contentValidation = validateOpenAiMessageContent({
      content: typedMessage.content,
      role,
      path: `messages[${index}].content`,
      hasToolCalls: Array.isArray(typedMessage.tool_calls)
    })
    if (!contentValidation.ok) return contentValidation

    if (role === 'tool') {
      const toolCallId = typedMessage.tool_call_id
      if (typeof toolCallId !== 'string' || !toolCallId.trim()) {
        return {
          ok: false,
          code: 'invalid_tool_message',
          message: `messages[${index}].tool_call_id must be a non-empty string.`
        }
      }
    }

    if (typedMessage.tool_calls !== undefined) {
      const toolCallsValidation = validateOpenAiToolCalls(
        typedMessage.tool_calls,
        `messages[${index}].tool_calls`
      )
      if (!toolCallsValidation.ok) return toolCallsValidation
    }
  }

  return { ok: true }
}

function validateOpenAiMessageContent({
  content,
  role,
  path,
  hasToolCalls
}: {
  content: unknown
  role: string
  path: string
  hasToolCalls: boolean
}): ApiRequestValidationResult {
  if ((content === undefined || content === null) && role === 'assistant') {
    return hasToolCalls
      ? { ok: true }
      : {
          ok: false,
          code: 'invalid_message_content',
          message: `${path} is required unless assistant tool_calls are provided.`
        }
  }

  if (typeof content === 'string') {
    return content.trim()
      ? { ok: true }
      : {
          ok: false,
          code: 'invalid_message_content',
          message: `${path} must not be empty.`
        }
  }

  if (!Array.isArray(content)) {
    return {
      ok: false,
      code: 'invalid_message_content',
      message: `${path} must be a string or an array of content parts.`
    }
  }

  if (content.length === 0) {
    return {
      ok: false,
      code: 'invalid_message_content',
      message: `${path} must include at least one content part.`
    }
  }

  for (const [partIndex, part] of content.entries()) {
    const partPath = `${path}[${partIndex}]`
    if (!part || typeof part !== 'object' || Array.isArray(part)) {
      return {
        ok: false,
        code: 'invalid_message_content_part',
        message: `${partPath} must be an object.`
      }
    }

    const typedPart = part as Record<string, unknown>
    const type = typedPart.type
    if (typeof type !== 'string' || !openAiContentPartTypes.has(type)) {
      return {
        ok: false,
        code: 'invalid_message_content_part',
        message:
          `${partPath}.type must be one of ` +
          'text, input_text, image_url, or input_image.'
      }
    }

    if (type === 'text' || type === 'input_text') {
      if (typeof typedPart.text !== 'string' || !typedPart.text.trim()) {
        return {
          ok: false,
          code: 'invalid_message_content_part',
          message: `${partPath}.text must be a non-empty string.`
        }
      }
    }

    if (type === 'image_url' || type === 'input_image') {
      const imageUrl = typedPart.image_url
      const url =
        typeof imageUrl === 'string'
          ? imageUrl
          : imageUrl && typeof imageUrl === 'object'
            ? (imageUrl as { url?: unknown }).url
            : null
      if (typeof url !== 'string' || !url.trim()) {
        return {
          ok: false,
          code: 'invalid_message_content_part',
          message: `${partPath}.image_url must include a non-empty url.`
        }
      }
    }
  }

  return { ok: true }
}

function validateOpenAiToolCalls(
  toolCalls: unknown,
  path: string
): ApiRequestValidationResult {
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
    return {
      ok: false,
      code: 'invalid_tool_calls',
      message: `${path} must include at least one tool call.`
    }
  }

  for (const [index, toolCall] of toolCalls.entries()) {
    const toolCallPath = `${path}[${index}]`
    if (!toolCall || typeof toolCall !== 'object' || Array.isArray(toolCall)) {
      return {
        ok: false,
        code: 'invalid_tool_calls',
        message: `${toolCallPath} must be an object.`
      }
    }

    const typedToolCall = toolCall as Record<string, unknown>
    if (typeof typedToolCall.id !== 'string' || !typedToolCall.id.trim()) {
      return {
        ok: false,
        code: 'invalid_tool_calls',
        message: `${toolCallPath}.id must be a non-empty string.`
      }
    }
    if (typedToolCall.type !== 'function') {
      return {
        ok: false,
        code: 'invalid_tool_calls',
        message: `${toolCallPath}.type must be function.`
      }
    }

    const fn = typedToolCall.function
    if (!fn || typeof fn !== 'object' || Array.isArray(fn)) {
      return {
        ok: false,
        code: 'invalid_tool_calls',
        message: `${toolCallPath}.function must be an object.`
      }
    }
    const typedFn = fn as Record<string, unknown>
    if (typeof typedFn.name !== 'string' || !typedFn.name.trim()) {
      return {
        ok: false,
        code: 'invalid_tool_calls',
        message: `${toolCallPath}.function.name must be a non-empty string.`
      }
    }
    if (typeof typedFn.arguments !== 'string') {
      return {
        ok: false,
        code: 'invalid_tool_calls',
        message: `${toolCallPath}.function.arguments must be a string.`
      }
    }
  }

  return { ok: true }
}

export function validateAnthropicMessages(
  messages: unknown[]
): ApiRequestValidationResult {
  if (messages.length === 0) {
    return {
      ok: false,
      code: 'missing_messages',
      message: 'messages must include at least one Anthropic message.'
    }
  }

  for (const [index, message] of messages.entries()) {
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      return {
        ok: false,
        code: 'invalid_message',
        message: `messages[${index}] must be an object.`
      }
    }

    const role = (message as { role?: unknown }).role
    if (typeof role !== 'string' || !anthropicMessageRoles.has(role)) {
      return {
        ok: false,
        code: 'invalid_message_role',
        message: `messages[${index}].role must be user or assistant.`
      }
    }

    const contentValidation = validateAnthropicContent(
      (message as { content?: unknown }).content,
      `messages[${index}].content`
    )
    if (!contentValidation.ok) return contentValidation
  }

  return { ok: true }
}

export function validateAnthropicSystem(
  system: unknown
): ApiRequestValidationResult {
  if (system === undefined) return { ok: true }

  const validation = validateAnthropicContent(system, 'system')
  if (!validation.ok) {
    return {
      ok: false,
      code:
        validation.code === 'invalid_message_content_part'
          ? validation.code
          : 'invalid_system',
      message: validation.message
    }
  }

  return { ok: true }
}

function validateAnthropicContent(
  content: unknown,
  path: string
): ApiRequestValidationResult {
  if (typeof content === 'string') {
    return content.trim()
      ? { ok: true }
      : {
          ok: false,
          code: 'invalid_message_content',
          message: `${path} must not be empty.`
        }
  }

  if (!Array.isArray(content)) {
    return {
      ok: false,
      code: 'invalid_message_content',
      message: `${path} must be a string or an array of content blocks.`
    }
  }

  if (content.length === 0) {
    return {
      ok: false,
      code: 'invalid_message_content',
      message: `${path} must include at least one content block.`
    }
  }

  for (const [index, block] of content.entries()) {
    const blockPath = `${path}[${index}]`
    if (!block || typeof block !== 'object' || Array.isArray(block)) {
      return {
        ok: false,
        code: 'invalid_message_content_part',
        message: `${blockPath} must be an object.`
      }
    }

    const typedBlock = block as Record<string, unknown>
    const type = typedBlock.type
    if (typeof type !== 'string' || !anthropicContentBlockTypes.has(type)) {
      return {
        ok: false,
        code: 'invalid_message_content_part',
        message: `${blockPath}.type must be one of text, tool_use, or tool_result.`
      }
    }

    if (type === 'text') {
      if (typeof typedBlock.text !== 'string' || !typedBlock.text.trim()) {
        return {
          ok: false,
          code: 'invalid_message_content_part',
          message: `${blockPath}.text must be a non-empty string.`
        }
      }
    }

    if (type === 'tool_use') {
      if (typeof typedBlock.id !== 'string' || !typedBlock.id.trim()) {
        return {
          ok: false,
          code: 'invalid_message_content_part',
          message: `${blockPath}.id must be a non-empty string.`
        }
      }
      if (typeof typedBlock.name !== 'string' || !typedBlock.name.trim()) {
        return {
          ok: false,
          code: 'invalid_message_content_part',
          message: `${blockPath}.name must be a non-empty string.`
        }
      }
      if (
        !typedBlock.input ||
        typeof typedBlock.input !== 'object' ||
        Array.isArray(typedBlock.input)
      ) {
        return {
          ok: false,
          code: 'invalid_message_content_part',
          message: `${blockPath}.input must be an object.`
        }
      }
    }

    if (type === 'tool_result') {
      if (
        typeof typedBlock.tool_use_id !== 'string' ||
        !typedBlock.tool_use_id.trim()
      ) {
        return {
          ok: false,
          code: 'invalid_message_content_part',
          message: `${blockPath}.tool_use_id must be a non-empty string.`
        }
      }

      const resultContent = typedBlock.content
      if (typeof resultContent !== 'string' && !Array.isArray(resultContent)) {
        return {
          ok: false,
          code: 'invalid_message_content_part',
          message: `${blockPath}.content must be a string or an array.`
        }
      }
    }
  }

  return { ok: true }
}
