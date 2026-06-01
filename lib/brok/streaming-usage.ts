type StreamUsage = {
  prompt_tokens?: unknown
  completion_tokens?: unknown
  total_tokens?: unknown
  input_tokens?: unknown
  output_tokens?: unknown
}

function contentPartText(part: unknown) {
  if (typeof part === 'string') return part
  if (!part || typeof part !== 'object') return ''

  const record = part as Record<string, unknown>
  if (typeof record.text === 'string') return record.text
  if (typeof record.content === 'string') return record.content
  return ''
}

function contentText(content: unknown) {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map(contentPartText).filter(Boolean).join('\n')
  }
  return ''
}

export function estimateTokensFromText(text: string) {
  return Math.max(0, Math.ceil(text.length / 4))
}

export function estimateTokensFromMessages(
  messages: Array<Record<string, unknown>>
) {
  return estimateTokensFromText(
    messages.map(message => contentText(message.content)).join('\n')
  )
}

export function usageNumber(usage: unknown, keys: string[]) {
  if (!usage || typeof usage !== 'object') return 0

  for (const key of keys) {
    const value = (usage as Record<string, unknown>)[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && Number.isFinite(Number(value))) {
      return Number(value)
    }
  }

  return 0
}

function deltaText(choice: unknown) {
  if (!choice || typeof choice !== 'object') return ''

  const record = choice as Record<string, any>
  return (
    contentText(record.delta?.content) || contentText(record.message?.content)
  )
}

export function createOpenAiStreamUsageAccumulator() {
  let content = ''
  let usage: StreamUsage | null = null

  return {
    trackSseLine(line: string) {
      if (!line.startsWith('data:')) return

      const data = line.slice(5).trim()
      if (!data || data === '[DONE]') return

      try {
        const payload = JSON.parse(data) as Record<string, unknown>
        if (payload.usage && typeof payload.usage === 'object') {
          usage = payload.usage as StreamUsage
        }
        if (Array.isArray(payload.choices)) {
          content += payload.choices.map(deltaText).join('')
        }
      } catch {}
    },
    snapshot() {
      return { content, usage }
    }
  }
}

export function resolveStreamTokenUsage({
  usage,
  content,
  messages
}: {
  usage?: unknown
  content: string
  messages: Array<Record<string, unknown>>
}) {
  const inputTokens =
    usageNumber(usage, ['prompt_tokens', 'input_tokens']) ||
    estimateTokensFromMessages(messages)
  const outputTokens =
    usageNumber(usage, ['completion_tokens', 'output_tokens']) ||
    estimateTokensFromText(content)

  return { inputTokens, outputTokens }
}
