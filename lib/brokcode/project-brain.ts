import type { GeneratedBrokCodeFile } from '@/lib/brokcode/generated-files'

type BrokCodeProjectBrainBackend = {
  provider?: string
  status?: string
  health?: string
  capabilities?: Record<string, boolean> | null
  [key: string]: unknown
} | null

export type BrokCodeProjectBrain = {
  product: string
  audience: string
  coreExperience: string
  aiFeatures: string[]
  designDirection: string
  currentPages: string[]
  backendSummary: string
  previousEdits: string[]
  suggestedNextActions: string[]
  updatedAt: string
}

const AI_FEATURES = [
  ['chat', 'Chat'],
  ['quiz', 'Quiz generation'],
  ['lesson', 'Lesson generation'],
  ['summar', 'Summaries'],
  ['upload', 'File upload'],
  ['photo', 'Image analysis'],
  ['recommend', 'Recommendations'],
  ['insight', 'Personalized insights']
] as const

const NEXT_ACTIONS_BY_DOMAIN = [
  {
    pattern: /\b(study|course|lesson|quiz|student|class|campus)\b/i,
    actions: [
      'Add upload flow',
      'Generate first lesson',
      'Add quiz mode',
      'Track mastery'
    ]
  },
  {
    pattern: /\b(nutrition|meal|fitness|wellness|health)\b/i,
    actions: [
      'Add onboarding',
      'Add photo upload',
      'Add weekly insights',
      'Add premium plan'
    ]
  },
  {
    pattern: /\b(crm|dashboard|saas|admin|analytics)\b/i,
    actions: ['Add auth', 'Add usage charts', 'Add admin panel', 'Add settings']
  }
] as const

function titleFromValue(value: string) {
  const cleaned = value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(
      /\b(create|build|make|design|a|an|the|polished|single-page|website|landing|page|app|ui|for|with|and|please|me)\b/gi,
      ' '
    )
    .replace(/[^a-z0-9 ]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 52)

  if (!cleaned) return 'BrokCode App'

  return cleaned
    .split(' ')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

function compactText(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function inferPages(files: GeneratedBrokCodeFile[]) {
  const paths = files.map(file => file.path)
  const namedPages = paths
    .filter(path => /(^|\/)(pages|app|routes)\//i.test(path))
    .map(path => {
      const parts = path
        .replace(/\.(tsx|ts|jsx|js|html)$/i, '')
        .split('/')
        .filter(Boolean)
      const leaf = parts.at(-1)
      return leaf === 'page' || leaf === 'index' ? parts.at(-2) : leaf
    })
    .filter(Boolean)
    .map(value => titleFromValue(value ?? 'Page'))

  const html = files
    .filter(file => /\.html?$/i.test(file.path))
    .map(file => file.content)
    .join('\n')
  const sectionIds = [
    ...html.matchAll(/<(?:section|main|article)\b[^>]*\bid=["']([^"']+)["']/gi)
  ]
    .map(match => titleFromValue(match[1] ?? 'Section'))
    .filter(Boolean)

  return [...new Set([...namedPages, ...sectionIds])].slice(0, 8)
}

function inferAudience(source: string) {
  if (/\bstudent|course|class|campus|university\b/i.test(source)) {
    return 'Students and instructors working through course projects.'
  }
  if (/\bteam|workspace|admin|saas|crm|dashboard\b/i.test(source)) {
    return 'Teams who need a focused operational workspace.'
  }
  if (/\bcustomer|shop|store|bakery|restaurant|club|event\b/i.test(source)) {
    return 'Customers or visitors using the public-facing experience.'
  }
  return 'People who need the generated app workflow to solve a clear job.'
}

function inferDesignDirection(source: string) {
  if (/\bmobile|iphone|pwa|wellness|fitness|nutrition\b/i.test(source)) {
    return 'Mobile-first, polished, and touch-friendly.'
  }
  if (/\bdashboard|admin|crm|analytics|saas\b/i.test(source)) {
    return 'Dense but calm dashboard UI optimized for repeated work.'
  }
  if (/\blanding|brand|marketing|portfolio|event\b/i.test(source)) {
    return 'Editorial landing page with a strong first impression.'
  }
  return 'Clean, responsive, and production-feeling.'
}

function inferAiFeatures(source: string) {
  return AI_FEATURES.filter(([needle]) => source.toLowerCase().includes(needle))
    .map(([, label]) => label)
    .slice(0, 6)
}

function inferNextActions(source: string, hasBackend: boolean) {
  const matched = NEXT_ACTIONS_BY_DOMAIN.find(item => item.pattern.test(source))
  const actions = matched?.actions ?? [
    'Add onboarding',
    'Improve mobile layout',
    'Add settings',
    'Deploy app'
  ]

  return [
    ...actions,
    hasBackend ? 'Test backend data flow' : 'Add backend',
    'Deploy app'
  ]
    .filter((value, index, list) => list.indexOf(value) === index)
    .slice(0, 7)
}

function backendSummary(backend?: BrokCodeProjectBrainBackend) {
  if (!backend || backend.provider === 'none') {
    return 'No backend connected yet.'
  }

  const capabilities = Object.entries(backend.capabilities ?? {})
    .filter(([, enabled]) => enabled)
    .map(([key]) => key)
  return `InsForge ${backend.health === 'online' ? 'online' : backend.status}; ${capabilities.join(', ') || 'capabilities pending'}.`
}

export function buildBrokCodeProjectBrain({
  projectName,
  command,
  files,
  backend,
  previousBrain
}: {
  projectName: string
  command?: string
  files?: GeneratedBrokCodeFile[]
  backend?: BrokCodeProjectBrainBackend
  previousBrain?: Partial<BrokCodeProjectBrain> | null
}): BrokCodeProjectBrain {
  const fileText = (files ?? [])
    .map(file => `${file.path}\n${compactText(file.content).slice(0, 1200)}`)
    .join('\n')
  const source = [projectName, command, fileText].filter(Boolean).join('\n')
  const hasBackend = backend?.provider === 'insforge'
  const pages = inferPages(files ?? [])

  return {
    product:
      previousBrain?.product?.trim() ||
      titleFromValue(command?.trim() || projectName),
    audience: inferAudience(source),
    coreExperience:
      compactText(command || fileText).slice(0, 220) || projectName,
    aiFeatures: inferAiFeatures(source),
    designDirection: inferDesignDirection(source),
    currentPages: pages.length ? pages : (previousBrain?.currentPages ?? []),
    backendSummary: backendSummary(backend),
    previousEdits: [
      ...(previousBrain?.previousEdits ?? []),
      ...(command ? [command] : [])
    ].slice(-5),
    suggestedNextActions: inferNextActions(source, hasBackend),
    updatedAt: new Date().toISOString()
  }
}

export function normalizeBrokCodeProjectBrain(value: unknown) {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const stringList = (input: unknown) =>
    Array.isArray(input)
      ? input.filter(item => typeof item === 'string').slice(0, 8)
      : []

  const product =
    typeof record.product === 'string' && record.product.trim()
      ? record.product.trim()
      : ''
  if (!product) return null

  return {
    product,
    audience:
      typeof record.audience === 'string' ? record.audience : 'Audience TBD.',
    coreExperience:
      typeof record.coreExperience === 'string'
        ? record.coreExperience
        : 'Core experience TBD.',
    aiFeatures: stringList(record.aiFeatures),
    designDirection:
      typeof record.designDirection === 'string'
        ? record.designDirection
        : 'Design direction TBD.',
    currentPages: stringList(record.currentPages),
    backendSummary:
      typeof record.backendSummary === 'string'
        ? record.backendSummary
        : 'No backend connected yet.',
    previousEdits: stringList(record.previousEdits),
    suggestedNextActions: stringList(record.suggestedNextActions),
    updatedAt:
      typeof record.updatedAt === 'string'
        ? record.updatedAt
        : new Date().toISOString()
  } satisfies BrokCodeProjectBrain
}
