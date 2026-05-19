const WEB_SEARCH_TOOL_TYPES = new Set([
  'web_search',
  'web_search_preview',
  'web_search_preview_2025_03_11'
])

export function isBrokWebSearchToolType(type: unknown) {
  return typeof type === 'string' && WEB_SEARCH_TOOL_TYPES.has(type)
}

export function normalizeProviderToolChoice(
  toolChoice?: string | { type?: string }
) {
  if (!toolChoice || toolChoice === 'none') {
    return undefined
  }

  if (typeof toolChoice === 'string') {
    if (toolChoice === 'auto' || toolChoice === 'required') {
      return toolChoice
    }

    return isBrokWebSearchToolType(toolChoice)
      ? undefined
      : { type: toolChoice }
  }

  if (typeof toolChoice.type !== 'string') {
    return undefined
  }

  return isBrokWebSearchToolType(toolChoice.type)
    ? undefined
    : (toolChoice as { type: string })
}

export function isWebSearchToolRequest(
  tools?: Array<{ type: string }>,
  toolChoice?: string | { type?: string }
) {
  const toolChoiceType =
    typeof toolChoice === 'string' ? toolChoice : toolChoice?.type
  const hasProviderTools =
    tools?.some(tool => !isBrokWebSearchToolType(tool.type)) === true

  if (toolChoiceType === 'none') {
    return false
  }

  if (
    toolChoiceType &&
    toolChoiceType !== 'auto' &&
    toolChoiceType !== 'required'
  ) {
    return isBrokWebSearchToolType(toolChoiceType)
  }

  if (hasProviderTools) {
    return false
  }

  return tools?.some(tool => isBrokWebSearchToolType(tool.type)) === true
}

export function filterProviderTools(tools?: Array<{ type: string }>) {
  const providerTools = tools?.filter(
    tool => !isBrokWebSearchToolType(tool.type)
  )
  return providerTools && providerTools.length > 0 ? providerTools : undefined
}
