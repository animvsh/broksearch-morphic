export const BROKCODE_RUNTIME_STATUSES = [
  'preparing',
  'installing',
  'building',
  'running',
  'healthy',
  'crashed',
  'timed_out',
  'stopped'
] as const

export type BrokCodeRuntimeStatus = (typeof BROKCODE_RUNTIME_STATUSES)[number]

export const BROKCODE_RUNTIME_APP_TYPES = ['static_html', 'vite_react'] as const

export type BrokCodeRuntimeAppType = (typeof BROKCODE_RUNTIME_APP_TYPES)[number]

export const BROKCODE_PACKAGE_MANAGERS = [
  'none',
  'bun',
  'npm',
  'pnpm',
  'yarn'
] as const

export type BrokCodePackageManager = (typeof BROKCODE_PACKAGE_MANAGERS)[number]

export type BrokCodeRuntimePort = {
  name: string
  port: number
  protocol: 'http'
  visibility: 'private' | 'public'
}

export type BrokCodeRuntimeHealth = {
  ok: boolean
  message?: string
  checkedAt?: string
  url?: string
}

export type BrokCodeRuntimeContext = {
  institutionId?: string | null
  courseId?: string | null
  sectionId?: string | null
  assignmentId?: string | null
}

export type BrokCodeRuntimeFile = {
  path: string
  content: string
}

export type BrokCodeRuntimeSpec = {
  projectId: string
  workspaceId: string
  userId: string
  versionId?: string | null
  sessionId?: string | null
  context: BrokCodeRuntimeContext
  appType: BrokCodeRuntimeAppType
  packageManager: BrokCodePackageManager
  workspacePath: string
  installCommand: string | null
  devCommand: string
  buildCommand: string | null
  ports: BrokCodeRuntimePort[]
  status: BrokCodeRuntimeStatus
  metadata: Record<string, unknown>
}

const statusSet = new Set<string>(BROKCODE_RUNTIME_STATUSES)
const packageManagerSet = new Set<string>(BROKCODE_PACKAGE_MANAGERS)

export function normalizeBrokCodeRuntimeStatus(
  value: unknown
): BrokCodeRuntimeStatus {
  return typeof value === 'string' && statusSet.has(value)
    ? (value as BrokCodeRuntimeStatus)
    : 'preparing'
}

function safeSegment(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 96) || 'runtime'
  )
}

function parsePackageJson(files: BrokCodeRuntimeFile[]) {
  const file = files.find(item => item.path === 'package.json')
  if (!file) return null

  try {
    return JSON.parse(file.content) as Record<string, unknown>
  } catch {
    return null
  }
}

function hasDependency(packageJson: Record<string, unknown>, name: string) {
  const dependencies =
    packageJson.dependencies && typeof packageJson.dependencies === 'object'
      ? (packageJson.dependencies as Record<string, unknown>)
      : {}
  const devDependencies =
    packageJson.devDependencies &&
    typeof packageJson.devDependencies === 'object'
      ? (packageJson.devDependencies as Record<string, unknown>)
      : {}

  return name in dependencies || name in devDependencies
}

export function detectBrokCodeRuntimeAppType(
  files: BrokCodeRuntimeFile[]
): BrokCodeRuntimeAppType {
  const packageJson = parsePackageJson(files)
  if (
    packageJson &&
    (hasDependency(packageJson, 'vite') || hasDependency(packageJson, 'react'))
  ) {
    return 'vite_react'
  }

  if (
    files.some(
      file =>
        file.path.endsWith('.tsx') ||
        file.path.endsWith('.jsx') ||
        file.path === 'src/main.tsx' ||
        file.path === 'src/App.tsx'
    )
  ) {
    return 'vite_react'
  }

  return 'static_html'
}

export function detectBrokCodePackageManager({
  files,
  appType
}: {
  files: BrokCodeRuntimeFile[]
  appType: BrokCodeRuntimeAppType
}): BrokCodePackageManager {
  if (appType === 'static_html') return 'none'
  if (
    files.some(file => file.path === 'bun.lockb' || file.path === 'bun.lock')
  ) {
    return 'bun'
  }
  if (files.some(file => file.path === 'pnpm-lock.yaml')) return 'pnpm'
  if (files.some(file => file.path === 'yarn.lock')) return 'yarn'

  const packageJson = parsePackageJson(files)
  const packageManager = packageJson?.packageManager
  if (typeof packageManager === 'string') {
    const [name] = packageManager.split('@')
    if (packageManagerSet.has(name)) return name as BrokCodePackageManager
  }

  return 'bun'
}

function installCommandFor(packageManager: BrokCodePackageManager) {
  if (packageManager === 'none') return null
  if (packageManager === 'npm') return 'npm install'
  if (packageManager === 'pnpm') return 'pnpm install'
  if (packageManager === 'yarn') return 'yarn install'
  return 'bun install'
}

function runCommandFor(packageManager: BrokCodePackageManager) {
  if (packageManager === 'none') return 'static-preview --host 0.0.0.0'
  if (packageManager === 'npm') return 'npm run dev -- --host 0.0.0.0'
  if (packageManager === 'pnpm') return 'pnpm dev --host 0.0.0.0'
  if (packageManager === 'yarn') return 'yarn dev --host 0.0.0.0'
  return 'bun run dev --host 0.0.0.0'
}

function buildCommandFor(packageManager: BrokCodePackageManager) {
  if (packageManager === 'none') return null
  if (packageManager === 'npm') return 'npm run build'
  if (packageManager === 'pnpm') return 'pnpm build'
  if (packageManager === 'yarn') return 'yarn build'
  return 'bun run build'
}

export function createBrokCodeRuntimeSpec({
  projectId,
  workspaceId,
  userId,
  versionId,
  sessionId,
  context,
  files,
  status
}: {
  projectId: string
  workspaceId: string
  userId: string
  versionId?: string | null
  sessionId?: string | null
  context?: BrokCodeRuntimeContext | null
  files: BrokCodeRuntimeFile[]
  status?: unknown
}): BrokCodeRuntimeSpec {
  const appType = detectBrokCodeRuntimeAppType(files)
  const packageManager = detectBrokCodePackageManager({ files, appType })
  const port = appType === 'static_html' ? 4173 : 5173
  const cleanVersion = versionId ? safeSegment(versionId) : 'latest'

  return {
    projectId,
    workspaceId,
    userId,
    versionId: versionId ?? null,
    sessionId: sessionId ?? null,
    context: {
      institutionId: context?.institutionId ?? null,
      courseId: context?.courseId ?? null,
      sectionId: context?.sectionId ?? null,
      assignmentId: context?.assignmentId ?? null
    },
    appType,
    packageManager,
    workspacePath: [
      '.brokcode',
      'runtime',
      safeSegment(workspaceId),
      safeSegment(projectId),
      cleanVersion
    ].join('/'),
    installCommand: installCommandFor(packageManager),
    devCommand: runCommandFor(packageManager),
    buildCommand: buildCommandFor(packageManager),
    ports: [
      {
        name: 'web',
        port,
        protocol: 'http',
        visibility: 'private'
      }
    ],
    status: normalizeBrokCodeRuntimeStatus(status),
    metadata: {
      fileCount: files.length,
      supportedAppTypes: [...BROKCODE_RUNTIME_APP_TYPES],
      managedStaticPreviewFallback: true
    }
  }
}
