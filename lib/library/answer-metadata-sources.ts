export function countAnswerMetadataSources(
  metadata: Record<string, any> | null
) {
  const answer = metadata?.answer
  if (!answer || typeof answer !== 'object') return 0

  const sourceUrls = new Set<string>()
  if (Array.isArray(answer.sources)) {
    for (const source of answer.sources) {
      const url =
        source && typeof source === 'object' && typeof source.url === 'string'
          ? source.url.trim()
          : ''
      if (url) sourceUrls.add(url)
    }
  }

  if (sourceUrls.size > 0) return sourceUrls.size

  const citationCount =
    typeof answer.citationCount === 'number' ? answer.citationCount : 0
  return Number.isFinite(citationCount) && citationCount > 0
    ? Math.floor(citationCount)
    : 0
}
