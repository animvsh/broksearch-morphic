import { extractFollowUpsFromMessage } from '@/lib/render/follow-ups'
import type { SearchResultItem } from '@/lib/types'
import type { UIMessage } from '@/lib/types/ai'

export type AnswerMetadata = {
  sources: SearchResultItem[]
  citationCount: number
  followUps: Array<{
    id: string
    label: string
    query: string
  }>
}

function normalizeSourceKey(url: string) {
  try {
    const parsed = new URL(url)
    parsed.hash = ''
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (/^utm_/i.test(key) || key === 'ref' || key === 'fbclid') {
        parsed.searchParams.delete(key)
      }
    }
    return parsed.toString().replace(/\/$/, '')
  } catch {
    return url.trim()
  }
}

function isSearchResultItem(value: unknown): value is SearchResultItem {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<SearchResultItem>
  return (
    typeof item.url === 'string' &&
    item.url.trim().length > 0 &&
    typeof item.title === 'string' &&
    typeof item.content === 'string'
  )
}

function getSearchOutputSources(output: any): SearchResultItem[] {
  if (!output || typeof output !== 'object') return []

  const citationMapSources =
    output.citationMap && typeof output.citationMap === 'object'
      ? Object.keys(output.citationMap)
          .map(Number)
          .sort((a, b) => a - b)
          .map(key => output.citationMap[key])
          .filter(isSearchResultItem)
      : []

  if (citationMapSources.length > 0) {
    return citationMapSources
  }

  return Array.isArray(output.results)
    ? output.results.filter(isSearchResultItem)
    : []
}

function extractSourcesFromMessage(message: UIMessage): SearchResultItem[] {
  const seen = new Set<string>()
  const sources: SearchResultItem[] = []

  for (const part of message.parts ?? []) {
    if (
      part.type !== 'tool-search' ||
      (part as any).state !== 'output-available'
    ) {
      continue
    }

    for (const source of getSearchOutputSources((part as any).output)) {
      const key = normalizeSourceKey(source.url)
      if (seen.has(key)) continue
      seen.add(key)
      sources.push(source)
    }
  }

  return sources
}

function countCitationReferences(message: UIMessage) {
  const seen = new Set<string>()

  for (const part of message.parts ?? []) {
    if (part.type !== 'text' || typeof (part as any).text !== 'string') {
      continue
    }

    const text = (part as any).text as string
    for (const match of text.matchAll(
      /\[(\d+)\]\((#[^)]+|https?:\/\/[^)]+)\)/g
    )) {
      seen.add(`${match[1]}:${match[2]}`)
    }
  }

  return seen.size
}

export function extractAnswerMetadata(message: UIMessage): AnswerMetadata {
  const sources = extractSourcesFromMessage(message)
  const followUps = extractFollowUpsFromMessage(message)

  return {
    sources,
    citationCount: countCitationReferences(message),
    followUps
  }
}
