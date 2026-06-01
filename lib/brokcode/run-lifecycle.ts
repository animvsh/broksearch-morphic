export const BROKCODE_RUN_LIFECYCLE_STEP_IDS = [
  'queued',
  'context_load',
  'generation',
  'build',
  'preview',
  'checks',
  'deploy',
  'done'
] as const

export type BrokCodeRunLifecycleStepId =
  (typeof BROKCODE_RUN_LIFECYCLE_STEP_IDS)[number]

export type BrokCodeRunLifecycleStatus =
  | 'queued'
  | 'running'
  | 'done'
  | 'error'
  | 'skipped'

export type BrokCodeRunLifecycleStep = {
  id: BrokCodeRunLifecycleStepId
  label: string
  detail: string
  status: BrokCodeRunLifecycleStatus
  updatedAt?: string
}

const LIFECYCLE_STEP_DETAILS: Record<
  BrokCodeRunLifecycleStepId,
  { label: string; detail: string }
> = {
  queued: {
    label: 'Queued run',
    detail: 'Run is durably queued on the server.'
  },
  context_load: {
    label: 'Loaded context',
    detail: 'Project, backend, and runtime context are loaded.'
  },
  generation: {
    label: 'Generated changes',
    detail: 'BrokCode is generating the requested app changes.'
  },
  build: {
    label: 'Wrote files',
    detail: 'Generated files are saved and materialized for runtime.'
  },
  preview: {
    label: 'Prepared preview',
    detail: 'Preview URL or runtime preview status is being prepared.'
  },
  checks: {
    label: 'Checked result',
    detail: 'Preview, usage, and quality signals are checked.'
  },
  deploy: {
    label: 'Deploy step',
    detail: 'Deployment runs only when the command requests publishing.'
  },
  done: {
    label: 'Finished run',
    detail: 'The run has a terminal success or error state.'
  }
}

function nowIso() {
  return new Date().toISOString()
}

function normalizeLifecycleStep(
  value: unknown,
  fallback: BrokCodeRunLifecycleStep
) {
  if (!value || typeof value !== 'object') return fallback

  const input = value as Partial<BrokCodeRunLifecycleStep>
  const status =
    input.status === 'queued' ||
    input.status === 'running' ||
    input.status === 'done' ||
    input.status === 'error' ||
    input.status === 'skipped'
      ? input.status
      : fallback.status

  return {
    ...fallback,
    label: typeof input.label === 'string' ? input.label : fallback.label,
    detail: typeof input.detail === 'string' ? input.detail : fallback.detail,
    status,
    updatedAt:
      typeof input.updatedAt === 'string' ? input.updatedAt : fallback.updatedAt
  }
}

function normalizeLifecycle(current?: unknown): BrokCodeRunLifecycleStep[] {
  const currentSteps = Array.isArray(current) ? current : []
  return BROKCODE_RUN_LIFECYCLE_STEP_IDS.map(id => {
    const fallback = {
      id,
      ...LIFECYCLE_STEP_DETAILS[id],
      status: 'queued' as const
    }
    const matching = currentSteps.find(
      step =>
        step && typeof step === 'object' && (step as { id?: unknown }).id === id
    )
    return normalizeLifecycleStep(matching, fallback)
  })
}

function updateStep(
  steps: BrokCodeRunLifecycleStep[],
  id: BrokCodeRunLifecycleStepId,
  status: BrokCodeRunLifecycleStatus,
  detail?: string
) {
  const updatedAt = nowIso()
  return steps.map(step =>
    step.id === id
      ? {
          ...step,
          status,
          detail: detail ?? step.detail,
          updatedAt
        }
      : step
  )
}

function markBeforeDone(
  steps: BrokCodeRunLifecycleStep[],
  id: BrokCodeRunLifecycleStepId
) {
  const targetIndex = BROKCODE_RUN_LIFECYCLE_STEP_IDS.indexOf(id)
  return steps.map(step => {
    const index = BROKCODE_RUN_LIFECYCLE_STEP_IDS.indexOf(step.id)
    return index >= 0 && index < targetIndex && step.status !== 'skipped'
      ? {
          ...step,
          status: 'done' as const,
          updatedAt: step.updatedAt ?? nowIso()
        }
      : step
  })
}

function progressFor(steps: BrokCodeRunLifecycleStep[]) {
  const weight = steps.reduce((total, step) => {
    if (step.status === 'done' || step.status === 'skipped') return total + 1
    if (step.status === 'running') return total + 0.5
    if (step.status === 'error') return total + 0.5
    return total
  }, 0)
  return Math.max(0, Math.min(100, Math.round((weight / steps.length) * 100)))
}

function phaseFor(steps: BrokCodeRunLifecycleStep[]) {
  return (
    steps.find(step => step.status === 'running') ??
    [...steps].reverse().find(step => step.status === 'error') ??
    [...steps].reverse().find(step => step.status === 'done') ??
    steps[0]
  )?.id
}

function payloadMessage(payload: unknown) {
  if (!payload || typeof payload !== 'object') return ''
  const message = (payload as Record<string, unknown>).message
  return typeof message === 'string' ? message.toLowerCase() : ''
}

function payloadHasDeployment(payload: unknown) {
  if (!payload || typeof payload !== 'object') return false
  const record = payload as Record<string, unknown>
  return (
    typeof record.deployment_url === 'string' ||
    typeof record.deploymentUrl === 'string'
  )
}

export function createBrokCodeRunLifecycle() {
  return updateStep(normalizeLifecycle(), 'queued', 'running')
}

export function advanceBrokCodeRunLifecycle({
  current,
  event,
  payload
}: {
  current?: unknown
  event: string
  payload?: unknown
}) {
  let steps = normalizeLifecycle(current)
  const message = payloadMessage(payload)

  if (event === 'task') {
    steps = updateStep(steps, 'queued', 'done')
    steps = updateStep(steps, 'context_load', 'running')
  } else if (event === 'status') {
    if (message.includes('queued')) {
      steps = updateStep(steps, 'queued', 'running', 'Run is queued.')
    } else if (message.includes('planning')) {
      steps = markBeforeDone(steps, 'context_load')
      steps = updateStep(
        steps,
        'context_load',
        'running',
        'Loading project context.'
      )
    } else if (message.includes('runtime') || message.includes('agent')) {
      steps = markBeforeDone(steps, 'generation')
      steps = updateStep(
        steps,
        'generation',
        'running',
        'Coding runtime is active.'
      )
    } else if (message.includes('writing') || message.includes('builder')) {
      steps = markBeforeDone(steps, 'generation')
      steps = updateStep(
        steps,
        'generation',
        'running',
        'Generating app changes.'
      )
    }
  } else if (event === 'delta') {
    steps = markBeforeDone(steps, 'generation')
    steps = updateStep(steps, 'generation', 'running')
  } else if (event === 'files') {
    steps = markBeforeDone(steps, 'build')
    steps = updateStep(steps, 'build', 'done', 'Generated files were saved.')
    steps = updateStep(steps, 'preview', 'running')
  } else if (event === 'preview') {
    steps = markBeforeDone(steps, 'checks')
    steps = updateStep(steps, 'preview', 'done', 'Preview URL is ready.')
    steps = updateStep(steps, 'checks', 'running')
  } else if (event === 'result') {
    steps = markBeforeDone(steps, 'done')
    steps = updateStep(steps, 'checks', 'done')
    steps = updateStep(
      steps,
      'deploy',
      payloadHasDeployment(payload) ? 'done' : 'skipped',
      payloadHasDeployment(payload)
        ? 'Deployment URL was recorded.'
        : 'No deployment was requested for this run.'
    )
    steps = updateStep(steps, 'done', 'done', 'Run completed.')
  } else if (event === 'error') {
    const running = steps.find(step => step.status === 'running')
    steps = updateStep(
      steps,
      running?.id ?? 'done',
      'error',
      message || 'Run failed.'
    )
    steps = updateStep(steps, 'done', 'error', message || 'Run failed.')
  }

  return {
    steps,
    phase: phaseFor(steps),
    progress: progressFor(steps)
  }
}
