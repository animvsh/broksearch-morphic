// Brok Build stream event producer.
// Generates the live "thinking" / build stream described in the PRD:
// Understanding -> Planning core modules -> Designing backend schema ->
// Preparing backend -> Starting OpenCode -> Generating frontend ->
// Wiring backend -> Building preview.
//
// We emit a structured event list that the workspace UI can render in
// real time, plus a few synthetic file diffs so the right panel feels alive.

import { classifyApp } from './app-types'
import { buildInternalPlan, buildUserVisiblePlan } from './plan'
import type {
  BrokBuildFilePreview,
  BrokStreamEvent,
  InternalPlan,
  UserVisiblePlan
} from './types'

const PHASE_SEQUENCE = [
  {
    phase: 'understanding',
    message: 'Understanding your app idea...',
    percent: 8
  },
  {
    phase: 'planning_core_modules',
    message: 'Planning core modules...',
    percent: 22
  },
  {
    phase: 'designing_backend_schema',
    message: 'Designing backend schema...',
    percent: 36
  },
  {
    phase: 'preparing_backend',
    message: 'Preparing InsForge backend resources...',
    percent: 50
  },
  {
    phase: 'starting_opencode',
    message: 'Starting OpenCode build session...',
    percent: 62
  },
  {
    phase: 'generating_frontend',
    message: 'Generating frontend...',
    percent: 78
  },
  {
    phase: 'wiring_backend',
    message: 'Wiring backend...',
    percent: 90
  },
  {
    phase: 'building_preview',
    message: 'Building preview...',
    percent: 96
  }
] as const

const DELAY_PER_PHASE_MS = 220

export type BuildStreamOptions = {
  prompt: string
  projectId: string
  emit?: (event: BrokStreamEvent) => void
  signal?: AbortSignal
  now?: () => number
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Build stream cancelled.'))
      return
    }
    const timer = setTimeout(() => resolve(), ms)
    if (signal) {
      const onAbort = () => {
        clearTimeout(timer)
        reject(new Error('Build stream cancelled.'))
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }
  })
}

function filePreviewForPlan(plan: InternalPlan): BrokBuildFilePreview[] {
  const files: BrokBuildFilePreview[] = []
  files.push({
    path: 'app/page.tsx',
    language: 'tsx',
    size: 1840,
    preview:
      "export default function HomePage() {\n  return (\n    <main>...</main>\n  )\n}"
  })
  files.push({
    path: 'app/layout.tsx',
    language: 'tsx',
    size: 540,
    preview: 'export default function RootLayout({ children }: ...) { ... }'
  })
  for (const page of plan.pages.slice(0, 6)) {
    const slug = page.toLowerCase().replace(/\s+/g, '-')
    files.push({
      path: `app/${slug}/page.tsx`,
      language: 'tsx',
      size: 1200 + page.length * 4,
      preview: `// ${page} screen\nimport { ... } from '@/components/...'\n\nexport default function ${slug.replace(
        /-/g,
        ''
      )}Page() {\n  return <div>${page}</div>\n}`
    })
  }
  files.push({
    path: 'lib/insforge/client.ts',
    language: 'ts',
    size: 980,
    preview: 'export const insforge = createClient({ ... })'
  })
  files.push({
    path: 'lib/insforge/schema.ts',
    language: 'ts',
    size: 1320,
    preview: '// Generated tables: ' + plan.database_tables.join(', ')
  })
  if (plan.storage_buckets.length > 0) {
    files.push({
      path: 'lib/insforge/storage.ts',
      language: 'ts',
      size: 410,
      preview:
        'export const buckets = [' +
        plan.storage_buckets.map(b => `'${b}'`).join(', ') +
        ']'
    })
  }
  if (plan.functions.length > 0) {
    files.push({
      path: 'lib/insforge/functions.ts',
      language: 'ts',
      size: 540,
      preview: 'export const functions = ' + plan.functions.join(', ')
    })
  }
  return files
}

function friendlyLogFor(phase: string, plan: InternalPlan, prompt: string) {
  switch (phase) {
    case 'understanding':
      return `Classified idea as ${plan.project_type.replace(/_/g, ' ')}.`
    case 'planning_core_modules':
      return `Planned ${plan.pages.length} pages and ${plan.ai_features.length} AI features.`
    case 'designing_backend_schema':
      return `Designed ${plan.database_tables.length} tables: ${plan.database_tables
        .slice(0, 4)
        .join(', ')}${
        plan.database_tables.length > 4 ? '...' : ''
      }.`
    case 'preparing_backend':
      return `Provisioning ${plan.database_tables.length} tables, ${plan.storage_buckets.length} storage buckets via InsForge.`
    case 'starting_opencode':
      return `Handing off to OpenCode on Railway with prompt: "${prompt.slice(0, 64)}${prompt.length > 64 ? '...' : ''}"`.replace(/\n/g, ' ')
    case 'generating_frontend':
      return `OpenCode generating ${plan.pages.length} React/Vite pages.`
    case 'wiring_backend':
      return `Connecting ${plan.pages.length} pages to InsForge client.`
    case 'building_preview':
      return `Starting managed preview on Railway.`
    default:
      return ''
  }
}

export type BuildStreamResult = {
  classification: ReturnType<typeof classifyApp>
  internalPlan: InternalPlan
  userPlan: UserVisiblePlan
  projectId: string
  events: BrokStreamEvent[]
}

export async function runBuildStream(
  options: BuildStreamOptions
): Promise<BuildStreamResult> {
  const emit = options.emit ?? (() => undefined)
  const signal = options.signal

  const classification = classifyApp(options.prompt)
  const { plan: internalPlan } = buildInternalPlan(
    options.prompt,
    classification
  )
  const userPlan = buildUserVisiblePlan(options.prompt, internalPlan)

  const events: BrokStreamEvent[] = []

  emit({ kind: 'phase', phase: 'understanding', message: 'Starting...' })
  events.push({
    kind: 'phase',
    phase: 'understanding',
    message: 'Starting...'
  })

  await sleep(DELAY_PER_PHASE_MS, signal)
  emit({ kind: 'plan', plan: userPlan })
  events.push({ kind: 'plan', plan: userPlan })

  emit({ kind: 'internal_plan', internalPlan })
  events.push({ kind: 'internal_plan', internalPlan })

  for (const step of PHASE_SEQUENCE) {
    if (signal?.aborted) {
      throw new Error('Build stream cancelled.')
    }
    emit({
      kind: 'phase',
      phase: step.phase,
      message: step.message
    })
    events.push({
      kind: 'phase',
      phase: step.phase,
      message: step.message
    })
    emit({
      kind: 'log',
      level: 'info',
      message: friendlyLogFor(step.phase, internalPlan, options.prompt)
    })
    events.push({
      kind: 'log',
      level: 'info',
      message: friendlyLogFor(step.phase, internalPlan, options.prompt)
    })
    emit({ kind: 'progress', phase: step.phase, percent: step.percent })
    events.push({ kind: 'progress', phase: step.phase, percent: step.percent })

    if (step.phase === 'preparing_backend') {
      emit({ kind: 'backend_status', status: 'provisioning' })
      events.push({ kind: 'backend_status', status: 'provisioning' })
    }
    if (step.phase === 'wiring_backend') {
      emit({ kind: 'backend_status', status: 'connected' })
      events.push({ kind: 'backend_status', status: 'connected' })
    }
    if (step.phase === 'starting_opencode') {
      const sessionId = `oc-${options.projectId.slice(0, 8)}-${Date.now().toString(36)}`
      emit({ kind: 'opencode_session', sessionId })
      events.push({ kind: 'opencode_session', sessionId })
    }

    await sleep(DELAY_PER_PHASE_MS, signal)
  }

  const filePreview = filePreviewForPlan(internalPlan)
  emit({ kind: 'files', files: filePreview })
  events.push({ kind: 'files', files: filePreview })

  const previewUrl = `/api/preview/${options.projectId}`
  emit({ kind: 'preview_url', url: previewUrl })
  events.push({ kind: 'preview_url', url: previewUrl })

  emit({
    kind: 'phase',
    phase: 'ready',
    message: 'Preview ready. You can keep editing by chat.'
  })
  events.push({
    kind: 'phase',
    phase: 'ready',
    message: 'Preview ready. You can keep editing by chat.'
  })
  emit({
    kind: 'done',
    projectId: options.projectId,
    previewUrl
  })
  events.push({
    kind: 'done',
    projectId: options.projectId,
    previewUrl
  })

  return {
    classification,
    internalPlan,
    userPlan,
    projectId: options.projectId,
    events
  }
}

export const PHASE_LABELS: Record<string, string> = {
  idle: 'Idle',
  understanding: 'Understanding',
  planning_core_modules: 'Planning core modules',
  designing_backend_schema: 'Designing backend schema',
  preparing_backend: 'Preparing backend',
  starting_opencode: 'Starting OpenCode',
  generating_frontend: 'Generating frontend',
  wiring_backend: 'Wiring backend',
  building_preview: 'Building preview',
  ready: 'Ready',
  failed: 'Failed',
  adjusting: 'Adjusting'
}
