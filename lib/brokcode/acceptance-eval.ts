import type { BrokCodeAcceptanceCase } from '@/lib/brokcode/acceptance-matrix'

export type BrokCodeAcceptanceCaseEval = {
  id: string
  title: string
  category: BrokCodeAcceptanceCase['category']
  status: 'passed' | 'failed'
  checks: string[]
  runtime?: string
  model?: string
  startedAt: string
  completedAt?: string
  projectId?: string
  previewUrl?: string
  deploymentUrl?: string
  error?: string
}

export type BrokCodeAcceptanceSuiteEvalInput = {
  startedAt: string
  completedAt: string
  baseUrl: string
  matrixMode: boolean
  fallbackPolicy: 'allowed' | 'disallowed'
  tuiStatus: 'passed' | 'skipped' | 'failed' | 'not-run'
  cases: BrokCodeAcceptanceCaseEval[]
}

export type BrokCodeAcceptanceSuiteEval = BrokCodeAcceptanceSuiteEvalInput & {
  kind: 'brokcode_acceptance_eval'
  status: 'passed' | 'failed'
  score: number
  passCount: number
  failCount: number
  totalCount: number
  blockers: string[]
}

export function buildBrokCodeAcceptanceSuiteEval(
  input: BrokCodeAcceptanceSuiteEvalInput
): BrokCodeAcceptanceSuiteEval {
  const totalCount = input.cases.length
  const passCount = input.cases.filter(
    testCase => testCase.status === 'passed'
  ).length
  const failCount = totalCount - passCount
  const blockers = input.cases
    .filter(testCase => testCase.status === 'failed')
    .map(testCase => `${testCase.id}: ${testCase.error ?? 'failed'}`)
  if (input.tuiStatus === 'failed' || input.tuiStatus === 'not-run') {
    blockers.push(`tui: ${input.tuiStatus}`)
  }
  const score =
    totalCount === 0 ? 0 : Math.round((passCount / totalCount) * 100)

  return {
    kind: 'brokcode_acceptance_eval',
    ...input,
    status: blockers.length === 0 ? 'passed' : 'failed',
    score,
    passCount,
    failCount,
    totalCount,
    blockers
  }
}

export function formatBrokCodeAcceptanceAdminReview(
  evalRecord: BrokCodeAcceptanceSuiteEval
) {
  return [
    '# BrokCode Acceptance Admin Review',
    '',
    `- Status: ${evalRecord.status}`,
    `- Score: ${evalRecord.score}%`,
    `- Cases: ${evalRecord.passCount}/${evalRecord.totalCount} passed`,
    `- TUI: ${evalRecord.tuiStatus}`,
    `- Fallback policy: ${evalRecord.fallbackPolicy}`,
    `- Base URL: ${evalRecord.baseUrl}`,
    `- Started: ${evalRecord.startedAt}`,
    `- Completed: ${evalRecord.completedAt}`,
    '',
    '## Case Evidence',
    '',
    ...evalRecord.cases.flatMap(testCase => [
      `### ${testCase.title} (${testCase.id})`,
      '',
      `- Status: ${testCase.status}`,
      `- Category: ${testCase.category}`,
      `- Project: ${testCase.projectId ?? 'not created'}`,
      `- Preview: ${testCase.previewUrl ?? 'not available'}`,
      `- Deploy: ${testCase.deploymentUrl ?? 'not available'}`,
      `- Checks: ${testCase.checks.join(', ') || 'none'}`,
      `- Runtime: ${testCase.runtime ?? 'unknown'}`,
      `- Model: ${testCase.model ?? 'unknown'}`,
      ...(testCase.error ? [`- Error: ${testCase.error}`] : []),
      ''
    ]),
    '## Blockers',
    '',
    ...(evalRecord.blockers.length > 0
      ? evalRecord.blockers.map(blocker => `- ${blocker}`)
      : ['- None'])
  ].join('\n')
}
