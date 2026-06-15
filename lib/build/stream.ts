// Brok Build stream event producer.
// Generates the live "thinking" / build stream described in the PRD:
// Understanding -> Planning core modules -> Designing data shape ->
// Preparing scaffold -> Creating BrokCode project -> Generating frontend ->
// Wiring local state -> Building managed preview.
//
// We emit a structured event list that the workspace UI can render in
// real time, plus starter file previews for signed-out/demo flows.

import { classifyApp } from './app-types'
import {
  persistBrokBuildProject,
  type PersistBrokBuildProjectOptions,
  type PersistedBrokBuildProject
} from './brokcode-project'
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
    message: 'Planning starter data model...',
    percent: 36
  },
  {
    phase: 'preparing_backend',
    message: 'Preparing BrokCode starter scaffold...',
    percent: 50
  },
  {
    phase: 'starting_opencode',
    message: 'Creating managed BrokCode project...',
    percent: 62
  },
  {
    phase: 'generating_frontend',
    message: 'Generating frontend...',
    percent: 78
  },
  {
    phase: 'wiring_backend',
    message: 'Wiring starter interactions...',
    percent: 90
  },
  {
    phase: 'building_preview',
    message: 'Publishing managed preview...',
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
  brokCodeProject?: Omit<
    PersistBrokBuildProjectOptions,
    'prompt' | 'userPlan'
  >
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
    path: 'lib/brokcode/starter-state.ts',
    language: 'ts',
    size: 980,
    preview: 'export const starterState = { ... }'
  })
  files.push({
    path: 'lib/brokcode/starter-schema.ts',
    language: 'ts',
    size: 1320,
    preview: '// Starter data model: ' + plan.database_tables.join(', ')
  })
  if (plan.storage_buckets.length > 0) {
    files.push({
      path: 'lib/brokcode/starter-assets.ts',
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
      path: 'lib/brokcode/starter-actions.ts',
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
      return `Mapped ${plan.database_tables.length} starter data groups: ${plan.database_tables
        .slice(0, 4)
        .join(', ')}${
        plan.database_tables.length > 4 ? '...' : ''
      }.`
    case 'preparing_backend':
      return `Preparing starter scaffold for ${plan.database_tables.length} data groups and ${plan.storage_buckets.length} asset areas.`
    case 'starting_opencode':
      return `Creating a BrokCode managed project for: "${prompt.slice(0, 64)}${prompt.length > 64 ? '...' : ''}"`.replace(/\n/g, ' ')
    case 'generating_frontend':
      return `Generating starter files for ${plan.pages.length} app screens.`
    case 'wiring_backend':
      return `Connecting ${plan.pages.length} screens to starter state and actions.`
    case 'building_preview':
      return `Publishing the BrokCode managed preview.`
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
  let activeProjectId = options.projectId
  let persistedProject: PersistedBrokBuildProject | null = null

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

  if (options.brokCodeProject) {
    try {
      persistedProject = await persistBrokBuildProject({
        ...options.brokCodeProject,
        prompt: options.prompt,
        userPlan
      })
      activeProjectId = persistedProject.projectId
      const projectEvent: BrokStreamEvent = {
        kind: 'brokcode_project',
        projectId: persistedProject.projectId,
        previewUrl: persistedProject.previewUrl,
        deploymentUrl: persistedProject.deploymentUrl,
        fileCount: persistedProject.fileCount
      }
      emit(projectEvent)
      events.push(projectEvent)
      const logEvent: BrokStreamEvent = {
        kind: 'log',
        level: 'info',
        message: `Created BrokCode project ${persistedProject.projectId} with ${persistedProject.fileCount} managed preview files.`
      }
      emit(logEvent)
      events.push(logEvent)
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'BrokCode project persistence failed.'
      const warnEvent: BrokStreamEvent = {
        kind: 'log',
        level: 'warn',
        message: `BrokCode project persistence skipped: ${message}`
      }
      emit(warnEvent)
      events.push(warnEvent)
    }
  }

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

    await sleep(DELAY_PER_PHASE_MS, signal)
  }

  const filePreview = persistedProject?.files ?? filePreviewForPlan(internalPlan)
  emit({ kind: 'files', files: filePreview })
  events.push({ kind: 'files', files: filePreview })

  const previewUrl = persistedProject?.previewUrl ?? null
  emit({ kind: 'preview_url', url: previewUrl })
  events.push({ kind: 'preview_url', url: previewUrl })

  const completionMessage = previewUrl
    ? 'Preview ready. You can keep editing by chat.'
    : 'Project scaffold ready. Sign in to open a managed preview.'
  emit({
    kind: 'phase',
    phase: 'ready',
    message: completionMessage
  })
  events.push({
    kind: 'phase',
    phase: 'ready',
    message: completionMessage
  })
  emit({
    kind: 'done',
    projectId: activeProjectId,
    previewUrl
  })
  events.push({
    kind: 'done',
    projectId: activeProjectId,
    previewUrl
  })

  return {
    classification,
    internalPlan,
    userPlan,
    projectId: activeProjectId,
    events
  }
}
