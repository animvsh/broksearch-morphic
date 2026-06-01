import {
  BROK_PROVIDER_API_KEY,
  BROK_PROVIDER_BASE_URL,
  BROK_PROVIDER_CHAT_MODEL
} from '@/lib/ai/brok'
import {
  buildSearchQueries,
  classifyQuery,
  generateFollowUps,
  rankAndDedupeSources,
  resolveQuery,
  runSearchPipeline,
  SearchResponse,
  SearchResult
} from '@/lib/brok/search-pipeline'
import { stripThinkingBlocks } from '@/lib/utils/strip-thinking-blocks'

export interface DeepResearchRequest {
  query: string
  recencyDays?: number
  domains?: string[]
  onProgress?: (event: DeepResearchProgressEvent) => Promise<void> | void
  shouldCancel?: () => Promise<boolean> | boolean
}

export interface DeepResearchProgressEvent {
  message: string
  progress: number
  metadata?: Record<string, any>
}

export interface DeepResearchPlanItem {
  id: string
  label: string
  query: string
  intent: string
}

export interface DeepResearchFinding {
  label: string
  query: string
  answer: string
  citationIds: string[]
  searchQueries: string[]
}

export interface DeepResearchSourceReading {
  citationId: string
  title: string
  url: string
  publisher?: string
  excerpt: string
  status: 'read' | 'failed'
}

export interface DeepResearchResult {
  answer: string
  citations: SearchResult[]
  followUps: Array<{ label: string; query: string }>
  resolvedQuery: string
  classification: SearchResponse['classification']
  researchPlan: DeepResearchPlanItem[]
  adaptivePlan: DeepResearchPlanItem[]
  findings: DeepResearchFinding[]
  sourceReadings: DeepResearchSourceReading[]
  gaps: string[]
  confidence: 'low' | 'medium' | 'high'
  usage: {
    researchPasses: number
    searchQueries: number
    tokensUsed: number
  }
  searchQueryList: string[]
}

export class DeepResearchCancelled extends Error {
  constructor() {
    super('Deep research task was cancelled.')
  }
}

export async function runDeepResearch(
  request: DeepResearchRequest
): Promise<DeepResearchResult> {
  const classification = classifyQuery(request.query)
  const resolvedQuery = resolveQuery(request.query, classification)
  const researchPlan = buildDeepResearchPlan({
    query: request.query,
    recencyDays: request.recencyDays,
    domains: request.domains
  })

  await emitProgress(request, {
    message: `Built a research plan with ${researchPlan.length} passes`,
    progress: 15,
    metadata: { researchPlan, resolvedQuery, classification }
  })

  const passResults: Array<{
    item: DeepResearchPlanItem
    response: SearchResponse
  }> = []
  const totalPasses = researchPlan.length

  for (let index = 0; index < researchPlan.length; index += 1) {
    await stopIfCancelled(request)
    const item = researchPlan[index]
    const progress = Math.round(20 + (index / Math.max(totalPasses, 1)) * 55)

    await emitProgress(request, {
      message: `Researching ${item.label.toLowerCase()}`,
      progress,
      metadata: {
        activeResearchPass: item,
        completedPasses: passResults.length,
        totalPasses
      }
    })

    const response = await runSearchPipeline({
      query: item.query,
      depth:
        item.intent === 'source-check' || item.intent === 'counter-evidence'
          ? 'deep'
          : 'standard',
      recencyDays: request.recencyDays,
      domains: request.domains
    })

    passResults.push({ item, response })
  }

  await stopIfCancelled(request)
  let citations = rankAndDedupeSources(
    passResults.flatMap(({ response }) => response.citations),
    resolvedQuery,
    24
  )
  let findings = buildFindings(passResults, citations)
  let gaps = identifyEvidenceGaps({
    query: resolvedQuery,
    citations,
    findings
  })
  const adaptivePlan = buildAdaptiveFollowUpPlan({
    query: resolvedQuery,
    gaps,
    findings,
    recencyDays: request.recencyDays,
    domains: request.domains
  })

  if (adaptivePlan.length > 0) {
    await emitProgress(request, {
      message: `Following up on ${adaptivePlan.length} evidence gaps`,
      progress: 74,
      metadata: { adaptivePlan, gaps }
    })

    for (let index = 0; index < adaptivePlan.length; index += 1) {
      await stopIfCancelled(request)
      const item = adaptivePlan[index]

      await emitProgress(request, {
        message: `Deepening ${item.label.toLowerCase()}`,
        progress: Math.round(76 + (index / adaptivePlan.length) * 8),
        metadata: {
          activeResearchPass: item,
          completedPasses: passResults.length,
          totalPasses: researchPlan.length + adaptivePlan.length
        }
      })

      const response = await runSearchPipeline({
        query: item.query,
        depth: item.intent === 'counter-evidence' ? 'deep' : 'standard',
        recencyDays: request.recencyDays,
        domains: request.domains
      })

      passResults.push({ item, response })
    }

    citations = rankAndDedupeSources(
      passResults.flatMap(({ response }) => response.citations),
      resolvedQuery,
      24
    )
    findings = buildFindings(passResults, citations)
    gaps = identifyEvidenceGaps({
      query: resolvedQuery,
      citations,
      findings
    })
  }

  await stopIfCancelled(request)
  await emitProgress(request, {
    message: 'Reading top sources directly',
    progress: 84,
    metadata: { citationCount: citations.length }
  })
  const sourceReadings = await readTopSources(citations, 8)

  await stopIfCancelled(request)
  await emitProgress(request, {
    message: 'Cross-checking sources and resolving conflicts',
    progress: 87,
    metadata: { completedPasses: passResults.length, totalPasses }
  })

  const confidence = scoreConfidence(citations, findings, gaps, sourceReadings)

  await emitProgress(request, {
    message: 'Writing the final research brief',
    progress: 90,
    metadata: {
      citationCount: citations.length,
      confidence,
      gaps
    }
  })

  const answer = await synthesizeDeepResearchAnswer({
    query: resolvedQuery,
    classificationType: classification.type,
    researchPlan,
    findings,
    sourceReadings,
    citations,
    gaps,
    confidence
  })
  const searchQueryList = Array.from(
    new Set(passResults.flatMap(({ response }) => response.searchQueryList))
  )
  const tokensUsed =
    passResults.reduce(
      (total, { response }) => total + response.tokensUsed,
      0
    ) + Math.round(answer.length / 4)

  return {
    answer,
    citations,
    followUps: generateFollowUps(resolvedQuery, classification, citations),
    resolvedQuery,
    classification,
    researchPlan,
    adaptivePlan,
    findings,
    sourceReadings,
    gaps,
    confidence,
    usage: {
      researchPasses: passResults.length,
      searchQueries: searchQueryList.length,
      tokensUsed
    },
    searchQueryList
  }
}

export function buildDeepResearchPlan({
  query,
  recencyDays,
  domains
}: {
  query: string
  recencyDays?: number
  domains?: string[]
}): DeepResearchPlanItem[] {
  const classification = classifyQuery(query)
  const resolvedQuery = resolveQuery(query, classification)
  const seedQueries = buildSearchQueries({
    query,
    classification,
    depth: 'deep',
    limit: 5,
    recencyDays,
    domains
  })
  const domainConstraint = domains?.length
    ? ` site:${domains.join(' OR site:')}`
    : ''
  const freshness = recencyDays ? ` within ${recencyDays} days` : ''
  const plan: DeepResearchPlanItem[] = [
    {
      id: 'overview',
      label: 'Overview',
      query: seedQueries[0] ?? resolvedQuery,
      intent: 'overview'
    },
    {
      id: 'primary-sources',
      label: 'Primary sources',
      query:
        seedQueries[1] ??
        `${resolvedQuery} official primary sources${freshness}${domainConstraint}`,
      intent: 'source-check'
    },
    {
      id: 'recent-updates',
      label: 'Recent updates',
      query:
        seedQueries[3] ??
        `${resolvedQuery} recent updates latest${freshness}${domainConstraint}`,
      intent: 'freshness-check'
    },
    {
      id: 'contradictions',
      label: 'Contradictions and caveats',
      query: `${resolvedQuery} risks caveats criticism limitations${freshness}${domainConstraint}`,
      intent: 'counter-evidence'
    },
    {
      id: 'implementation',
      label:
        classification.type === 'technical'
          ? 'Implementation evidence'
          : 'Examples and evidence',
      query:
        seedQueries[4] ??
        `${resolvedQuery} examples evidence implementation${freshness}${domainConstraint}`,
      intent: 'evidence'
    }
  ]

  if (classification.type === 'comparison') {
    plan.push({
      id: 'comparison-table',
      label: 'Comparison details',
      query: `${resolvedQuery} pricing features tradeoffs comparison${freshness}${domainConstraint}`,
      intent: 'comparison'
    })
  }

  return dedupePlan(plan).slice(0, 6)
}

export function buildAdaptiveFollowUpPlan({
  query,
  gaps,
  findings,
  recencyDays,
  domains
}: {
  query: string
  gaps: string[]
  findings: DeepResearchFinding[]
  recencyDays?: number
  domains?: string[]
}): DeepResearchPlanItem[] {
  const domainConstraint = domains?.length
    ? ` site:${domains.join(' OR site:')}`
    : ''
  const freshness = recencyDays ? ` within ${recencyDays} days` : ''
  const weakFindings = findings
    .filter(finding => finding.citationIds.length < 2)
    .slice(0, 2)
  const plan: DeepResearchPlanItem[] = []

  if (
    gaps.some(gap => /primary source|small source set|narrow set/i.test(gap))
  ) {
    plan.push({
      id: 'adaptive-primary-verification',
      label: 'Primary verification',
      query: `${query} official documentation primary source data report${freshness}${domainConstraint}`,
      intent: 'source-check'
    })
  }

  if (gaps.some(gap => /freshness/i.test(gap))) {
    plan.push({
      id: 'adaptive-freshness',
      label: 'Freshness verification',
      query: `${query} latest updated release announcement 2026 2025${freshness}${domainConstraint}`,
      intent: 'freshness-check'
    })
  }

  for (const finding of weakFindings) {
    plan.push({
      id: `adaptive-${finding.label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')}`,
      label: `${finding.label} follow-up`,
      query: `${finding.query} evidence sources verification${freshness}${domainConstraint}`,
      intent: 'evidence'
    })
  }

  if (plan.length === 0 && findings.length > 0) {
    plan.push({
      id: 'adaptive-conflict-check',
      label: 'Conflict check',
      query: `${query} conflicting evidence criticism limitations${freshness}${domainConstraint}`,
      intent: 'counter-evidence'
    })
  }

  return dedupePlan(plan).slice(0, 3)
}

async function emitProgress(
  request: DeepResearchRequest,
  event: DeepResearchProgressEvent
) {
  await request.onProgress?.(event)
}

async function stopIfCancelled(request: DeepResearchRequest) {
  if (await request.shouldCancel?.()) {
    throw new DeepResearchCancelled()
  }
}

function dedupePlan(plan: DeepResearchPlanItem[]) {
  const seen = new Set<string>()
  return plan.filter(item => {
    const key = item.query.toLowerCase().replace(/\s+/g, ' ').trim()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function buildFindings(
  passResults: Array<{ item: DeepResearchPlanItem; response: SearchResponse }>,
  citations: SearchResult[]
): DeepResearchFinding[] {
  return passResults.map(({ item, response }) => {
    const citationIds = response.citations
      .map(source => findCitationId(source, citations))
      .filter((id): id is string => Boolean(id))
      .slice(0, 6)

    return {
      label: item.label,
      query: item.query,
      answer: response.answer,
      citationIds,
      searchQueries: response.searchQueryList
    }
  })
}

function findCitationId(source: SearchResult, citations: SearchResult[]) {
  const sourceKey = normalizeUrlForMatch(source.url)
  return citations.find(
    citation => normalizeUrlForMatch(citation.url) === sourceKey
  )?.id
}

function normalizeUrlForMatch(url: string) {
  try {
    const parsed = new URL(url)
    parsed.hash = ''
    parsed.search = ''
    return parsed.toString().replace(/\/$/, '')
  } catch {
    return url
  }
}

function identifyEvidenceGaps({
  query,
  citations,
  findings
}: {
  query: string
  citations: SearchResult[]
  findings: DeepResearchFinding[]
}): string[] {
  const gaps: string[] = []
  const hosts = new Set(
    citations.map(source => source.publisher).filter(Boolean)
  )
  const hasPrimarySource = citations.some(source =>
    /(^|\.)((docs|developer|platform|support)\.|github\.com|\.gov|\.edu|arxiv\.org)/i.test(
      source.publisher ?? ''
    )
  )

  if (citations.length < 6) {
    gaps.push('Only a small source set was available.')
  }

  if (hosts.size < 3) {
    gaps.push('Most evidence came from a narrow set of domains.')
  }

  if (!hasPrimarySource) {
    gaps.push('No clearly primary source appeared in the top citations.')
  }

  if (
    /\b(latest|today|current|news|pricing|released|launch)\b/i.test(query) &&
    !citations.some(source =>
      /\b(2026|2025|today|yesterday|updated|released|published)\b/i.test(
        `${source.title} ${source.snippet}`
      )
    )
  ) {
    gaps.push('Freshness evidence was weak for a current-events question.')
  }

  if (findings.some(finding => finding.citationIds.length === 0)) {
    gaps.push('At least one research pass did not return reusable citations.')
  }

  return Array.from(new Set(gaps)).slice(0, 5)
}

async function readTopSources(
  citations: SearchResult[],
  limit: number
): Promise<DeepResearchSourceReading[]> {
  const targets = citations
    .filter(source => /^https?:\/\//i.test(source.url))
    .slice(0, limit)

  const reads = await Promise.all(
    targets.map(async source => {
      try {
        const response = await fetch(source.url, {
          headers: {
            Accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8',
            'User-Agent':
              'BrokDeepResearch/1.0 (+https://brok.fyi; research citation reader)'
          },
          signal: AbortSignal.timeout(4500)
        })

        if (!response.ok) {
          throw new Error(`Source returned ${response.status}`)
        }

        const contentType = response.headers.get('content-type') ?? ''
        const raw = await response.text()
        const text = contentType.includes('text/plain')
          ? normalizeWhitespace(raw)
          : extractReadableText(raw)
        const excerpt = selectRelevantExcerpt(text, source.snippet)

        if (excerpt.length < 120) {
          throw new Error('Readable excerpt too short')
        }

        return {
          citationId: source.id,
          title: source.title,
          url: source.url,
          publisher: source.publisher,
          excerpt,
          status: 'read' as const
        }
      } catch {
        return {
          citationId: source.id,
          title: source.title,
          url: source.url,
          publisher: source.publisher,
          excerpt: source.snippet,
          status: 'failed' as const
        }
      }
    })
  )

  return reads
}

function extractReadableText(html: string) {
  return normalizeWhitespace(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<\/(p|div|section|article|li|h[1-6]|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
  )
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function selectRelevantExcerpt(text: string, snippet: string) {
  const cleaned = normalizeWhitespace(text)
  if (cleaned.length <= 2400) return cleaned

  const snippetTerms = snippet
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter(term => term.length > 4)
    .slice(0, 8)
  const lower = cleaned.toLowerCase()
  const matchIndex = snippetTerms
    .map(term => lower.indexOf(term))
    .filter(index => index >= 0)
    .sort((a, b) => a - b)[0]

  if (matchIndex === undefined) {
    return cleaned.slice(0, 2400)
  }

  const start = Math.max(matchIndex - 500, 0)
  return cleaned.slice(start, start + 2400)
}

function scoreConfidence(
  citations: SearchResult[],
  findings: DeepResearchFinding[],
  gaps: string[],
  sourceReadings: DeepResearchSourceReading[] = []
): DeepResearchResult['confidence'] {
  const averageQuality =
    citations.reduce((sum, source) => sum + (source.qualityScore ?? 0), 0) /
    Math.max(citations.length, 1)
  const citedFindings = findings.filter(
    finding => finding.citationIds.length > 0
  ).length
  const readSources = sourceReadings.filter(
    reading => reading.status === 'read'
  ).length
  const score =
    averageQuality +
    Math.min(citations.length, 12) * 2 +
    citedFindings * 5 -
    gaps.length * 10 +
    Math.min(readSources, 8) * 2

  if (score >= 75) return 'high'
  if (score >= 45) return 'medium'
  return 'low'
}

async function synthesizeDeepResearchAnswer({
  query,
  classificationType,
  researchPlan,
  findings,
  sourceReadings,
  citations,
  gaps,
  confidence
}: {
  query: string
  classificationType: string
  researchPlan: DeepResearchPlanItem[]
  findings: DeepResearchFinding[]
  sourceReadings: DeepResearchSourceReading[]
  citations: SearchResult[]
  gaps: string[]
  confidence: DeepResearchResult['confidence']
}) {
  if (citations.length === 0) {
    return 'I could not find reliable sources for this deep research task.'
  }

  if (!BROK_PROVIDER_API_KEY) {
    return fallbackDeepResearchAnswer({
      query,
      findings,
      sourceReadings,
      citations,
      gaps,
      confidence
    })
  }

  const citationContext = citations
    .map(
      (citation, index) =>
        `[${index + 1}] ${citation.title}\nURL: ${citation.url}\nPublisher: ${
          citation.publisher ?? 'unknown'
        }\nQuality: ${citation.qualityScore ?? 0}/100\nSnippet: ${
          citation.snippet
        }`
    )
    .join('\n\n')
  const findingContext = findings
    .map(
      finding =>
        `Pass: ${finding.label}\nQuery: ${finding.query}\nReusable citations: ${
          finding.citationIds.join(', ') || 'none'
        }\nFinding draft:\n${finding.answer}`
    )
    .join('\n\n')
  const sourceReadingContext = sourceReadings
    .filter(reading => reading.status === 'read')
    .map(
      reading =>
        `Citation: ${reading.citationId}\nTitle: ${reading.title}\nURL: ${reading.url}\nPublisher: ${
          reading.publisher ?? 'unknown'
        }\nDirect excerpt:\n${reading.excerpt}`
    )
    .join('\n\n')

  const response = await fetch(`${BROK_PROVIDER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${BROK_PROVIDER_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: BROK_PROVIDER_CHAT_MODEL,
      max_tokens: 2200,
      messages: [
        {
          role: 'system',
          content:
            'You are Brok Deep Research. Produce a rigorous research brief using only the provided findings, citations, and direct source excerpts. Be direct, concrete, and source-grounded. Start with the answer. Include sections: Answer, Evidence, Caveats, What to verify next. Cite factual claims with [1], [2], etc. Do not use generic filler, hype, or "let me know" endings. If evidence conflicts, explain the conflict.'
        },
        {
          role: 'user',
          content: `Question: ${query}\nQuestion type: ${classificationType}\nConfidence: ${confidence}\nResearch plan: ${researchPlan
            .map(item => `${item.label}: ${item.query}`)
            .join(' | ')}\nEvidence gaps: ${
            gaps.length ? gaps.join('; ') : 'none'
          }\n\nResearch findings:\n${findingContext}\n\nDirect source excerpts:\n${
            sourceReadingContext || 'No direct source excerpts were readable.'
          }\n\nCitations:\n${citationContext}`
        }
      ]
    })
  })

  if (!response.ok) {
    return fallbackDeepResearchAnswer({
      query,
      findings,
      sourceReadings,
      citations,
      gaps,
      confidence
    })
  }

  const data = await response.json()
  return stripThinkingBlocks(
    data.choices?.[0]?.message?.content ||
      fallbackDeepResearchAnswer({
        query,
        findings,
        sourceReadings,
        citations,
        gaps,
        confidence
      })
  )
}

function fallbackDeepResearchAnswer({
  query,
  findings,
  sourceReadings,
  citations,
  gaps,
  confidence
}: {
  query: string
  findings: DeepResearchFinding[]
  sourceReadings?: DeepResearchSourceReading[]
  citations: SearchResult[]
  gaps: string[]
  confidence: DeepResearchResult['confidence']
}) {
  const evidence = findings
    .map(finding => {
      const sourceText = finding.citationIds.length
        ? ` Sources: ${finding.citationIds.join(', ')}.`
        : ''
      return `- ${finding.label}: ${finding.answer.slice(0, 520).trim()}${sourceText}`
    })
    .join('\n')
  const sourceList = citations
    .slice(0, 8)
    .map(
      (source, index) =>
        `${index + 1}. ${source.title} - ${source.publisher ?? source.url}`
    )
    .join('\n')
  const directReads = (sourceReadings ?? [])
    .filter(reading => reading.status === 'read')
    .slice(0, 5)
    .map(
      reading => `- ${reading.title}: ${reading.excerpt.slice(0, 420).trim()}`
    )
    .join('\n')

  return [
    `Answer\nDeep research for: ${query}`,
    `Confidence: ${confidence}`,
    `Evidence\n${evidence}`,
    directReads ? `Direct source reads\n${directReads}` : '',
    gaps.length ? `Caveats\n${gaps.map(gap => `- ${gap}`).join('\n')}` : '',
    `Sources checked\n${sourceList}`
  ]
    .filter(Boolean)
    .join('\n\n')
}
