import {
  MINIMAX_API_KEY,
  MINIMAX_BASE_URL,
  MINIMAX_CHAT_MODEL
} from '@/lib/ai/minimax'
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

export interface DeepResearchResult {
  answer: string
  citations: SearchResult[]
  followUps: Array<{ label: string; query: string }>
  resolvedQuery: string
  classification: SearchResponse['classification']
  researchPlan: DeepResearchPlanItem[]
  findings: DeepResearchFinding[]
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
      depth: item.intent === 'source-check' ? 'standard' : 'lite',
      recencyDays: request.recencyDays,
      domains: request.domains
    })

    passResults.push({ item, response })
  }

  await stopIfCancelled(request)
  await emitProgress(request, {
    message: 'Cross-checking sources and resolving conflicts',
    progress: 80,
    metadata: { completedPasses: passResults.length, totalPasses }
  })

  const citations = rankAndDedupeSources(
    passResults.flatMap(({ response }) => response.citations),
    resolvedQuery,
    24
  )
  const findings = buildFindings(passResults, citations)
  const gaps = identifyEvidenceGaps({
    query: resolvedQuery,
    citations,
    findings
  })
  const confidence = scoreConfidence(citations, findings, gaps)

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
    findings,
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

function scoreConfidence(
  citations: SearchResult[],
  findings: DeepResearchFinding[],
  gaps: string[]
): DeepResearchResult['confidence'] {
  const averageQuality =
    citations.reduce((sum, source) => sum + (source.qualityScore ?? 0), 0) /
    Math.max(citations.length, 1)
  const citedFindings = findings.filter(
    finding => finding.citationIds.length > 0
  ).length
  const score =
    averageQuality +
    Math.min(citations.length, 12) * 2 +
    citedFindings * 5 -
    gaps.length * 10

  if (score >= 75) return 'high'
  if (score >= 45) return 'medium'
  return 'low'
}

async function synthesizeDeepResearchAnswer({
  query,
  classificationType,
  researchPlan,
  findings,
  citations,
  gaps,
  confidence
}: {
  query: string
  classificationType: string
  researchPlan: DeepResearchPlanItem[]
  findings: DeepResearchFinding[]
  citations: SearchResult[]
  gaps: string[]
  confidence: DeepResearchResult['confidence']
}) {
  if (citations.length === 0) {
    return 'I could not find reliable sources for this deep research task.'
  }

  if (!MINIMAX_API_KEY) {
    return fallbackDeepResearchAnswer({
      query,
      findings,
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

  const response = await fetch(`${MINIMAX_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${MINIMAX_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: MINIMAX_CHAT_MODEL,
      max_tokens: 2200,
      messages: [
        {
          role: 'system',
          content:
            'You are Brok Deep Research. Produce a rigorous research brief using only the provided findings and citations. Be direct, concrete, and source-grounded. Start with the answer. Include sections: Answer, Evidence, Caveats, What to verify next. Cite factual claims with [1], [2], etc. Do not use generic filler, hype, or "let me know" endings. If evidence conflicts, explain the conflict.'
        },
        {
          role: 'user',
          content: `Question: ${query}\nQuestion type: ${classificationType}\nConfidence: ${confidence}\nResearch plan: ${researchPlan
            .map(item => `${item.label}: ${item.query}`)
            .join(' | ')}\nEvidence gaps: ${
            gaps.length ? gaps.join('; ') : 'none'
          }\n\nResearch findings:\n${findingContext}\n\nCitations:\n${citationContext}`
        }
      ]
    })
  })

  if (!response.ok) {
    return fallbackDeepResearchAnswer({
      query,
      findings,
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
        citations,
        gaps,
        confidence
      })
  )
}

function fallbackDeepResearchAnswer({
  query,
  findings,
  citations,
  gaps,
  confidence
}: {
  query: string
  findings: DeepResearchFinding[]
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

  return [
    `Answer\nDeep research for: ${query}`,
    `Confidence: ${confidence}`,
    `Evidence\n${evidence}`,
    gaps.length ? `Caveats\n${gaps.map(gap => `- ${gap}`).join('\n')}` : '',
    `Sources checked\n${sourceList}`
  ]
    .filter(Boolean)
    .join('\n\n')
}
