import { type BrokModelId } from '@/lib/brok/models'
import { routeToProviderResponse } from '@/lib/brok/provider-router'

type ChatMessage = {
  role: string
  content: string
}

export async function generateBrokPresentationText({
  messages,
  maxTokens,
  temperature = 0.7,
  model = 'brok-lite',
  onDelta
}: {
  messages: ChatMessage[]
  maxTokens: number
  temperature?: number
  model?: BrokModelId
  onDelta?: (delta: string) => void
}): Promise<string> {
  const response = await routeToProviderResponse(model, {
    model,
    messages,
    stream: true,
    temperature,
    maxTokens
  })

  if (!response.body) {
    throw new Error('Brok generation response did not include a body')
  }

  return readOpenAiCompatibleStream(response.body, onDelta)
}

export async function readOpenAiCompatibleStream(
  body: ReadableStream<Uint8Array>,
  onDelta?: (delta: string) => void
): Promise<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''
  let isThinking = false

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const delta = parseSseContentDelta(line)
      if (!delta) continue

      fullText += delta
      const visibleDelta = stripThinkingDelta(
        delta,
        state => {
          isThinking = state
        },
        isThinking
      )
      if (visibleDelta) onDelta?.(visibleDelta)
    }
  }

  const finalDelta = parseSseContentDelta(buffer)
  if (finalDelta) {
    fullText += finalDelta
    const visibleDelta = stripThinkingDelta(
      finalDelta,
      state => {
        isThinking = state
      },
      isThinking
    )
    if (visibleDelta) onDelta?.(visibleDelta)
  }

  return fullText
}

export function extractJsonArray<T>(text: string): T[] | null {
  const cleaned = stripCodeFences(text)
  const match = cleaned.match(/\[[\s\S]*\]/)
  if (!match) return null

  try {
    const parsed = JSON.parse(match[0])
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function extractJsonObject<T>(text: string): T | null {
  const cleaned = stripCodeFences(text)
  const match = cleaned.match(/\{[\s\S]*\}/)
  if (!match) return null

  try {
    return JSON.parse(match[0]) as T
  } catch {
    return null
  }
}

function parseSseContentDelta(line: string): string | null {
  if (!line.startsWith('data:')) return null

  const data = line.slice(5).trim()
  if (!data || data === '[DONE]') return null

  try {
    const parsed = JSON.parse(data)
    return parsed.choices?.[0]?.delta?.content ?? null
  } catch {
    return null
  }
}

function stripCodeFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim()
}

function stripThinkingDelta(
  delta: string,
  setThinking: (thinking: boolean) => void,
  isThinking: boolean
): string {
  let remaining = delta
  let output = ''
  let thinking = isThinking

  while (remaining.length > 0) {
    if (thinking) {
      const endIndex = remaining.indexOf('</think>')
      if (endIndex === -1) {
        remaining = ''
      } else {
        remaining = remaining.slice(endIndex + '</think>'.length)
        thinking = false
      }
      continue
    }

    const startIndex = remaining.indexOf('<think>')
    if (startIndex === -1) {
      output += remaining
      remaining = ''
    } else {
      output += remaining.slice(0, startIndex)
      remaining = remaining.slice(startIndex + '<think>'.length)
      thinking = true
    }
  }

  setThinking(thinking)
  return output
}
