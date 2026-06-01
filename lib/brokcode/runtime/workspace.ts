import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  BrokCodePackageManager,
  BrokCodeRuntimeAppType,
  BrokCodeRuntimeFile,
  BrokCodeRuntimeSpec,
  detectBrokCodeRuntimeAppType,
  parseBrokCodePackageJson
} from '@/lib/brokcode/runtime/contract'

const MAX_RUNTIME_FILE_BYTES = 1024 * 1024
const MAX_RUNTIME_TOTAL_BYTES = 8 * 1024 * 1024

export type BrokCodeRuntimeManifestFile = {
  path: string
  language: string
  sizeBytes: number
  sha256: string
}

export type BrokCodeRuntimeWorkspaceManifest = {
  appType: BrokCodeRuntimeAppType
  activeEntrypoint: string | null
  workspacePath: string
  packageManager: BrokCodePackageManager
  installCommand: string | null
  devCommand: string
  buildCommand: string | null
  files: BrokCodeRuntimeManifestFile[]
  generatedFiles: string[]
  totalBytes: number
  materializedAt: string
}

export class BrokCodeRuntimeWorkspaceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BrokCodeRuntimeWorkspaceError'
  }
}

function runtimeWorkspaceRoot() {
  return path.resolve(
    process.env.BROKCODE_RUNTIME_WORKSPACE_DIR ??
      path.join(process.cwd(), '.brokcode', 'runtime')
  )
}

function normalizeRuntimePath(value: string) {
  const cleanPath = value.trim().replace(/\\/g, '/').replace(/^\/+/, '')
  if (
    !cleanPath ||
    cleanPath.includes('\0') ||
    cleanPath.split('/').some(part => !part || part === '.' || part === '..')
  ) {
    throw new BrokCodeRuntimeWorkspaceError('Invalid file path')
  }

  return cleanPath
}

function isBinaryContent(content: string) {
  return content.includes('\0')
}

function inferLanguage(filePath: string) {
  if (filePath.endsWith('.tsx')) return 'tsx'
  if (filePath.endsWith('.ts')) return 'ts'
  if (filePath.endsWith('.jsx')) return 'jsx'
  if (filePath.endsWith('.js')) return 'js'
  if (filePath.endsWith('.css')) return 'css'
  if (filePath.endsWith('.html')) return 'html'
  if (filePath.endsWith('.json')) return 'json'
  if (filePath.endsWith('.md')) return 'markdown'
  return 'text'
}

function checksum(content: string) {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

function isInsidePath(parent: string, child: string) {
  const relative = path.relative(parent, child)
  return (
    Boolean(relative) &&
    !relative.startsWith('..') &&
    !path.isAbsolute(relative)
  )
}

function mergeFiles(files: BrokCodeRuntimeFile[]) {
  const byPath = new Map<string, BrokCodeRuntimeFile>()
  for (const file of files) {
    const cleanPath = normalizeRuntimePath(file.path)
    const sizeBytes = Buffer.byteLength(file.content, 'utf8')
    if (sizeBytes > MAX_RUNTIME_FILE_BYTES) {
      throw new BrokCodeRuntimeWorkspaceError(
        `Generated file is too large: ${cleanPath}`
      )
    }
    if (isBinaryContent(file.content)) {
      throw new BrokCodeRuntimeWorkspaceError(
        `Generated file appears to be binary: ${cleanPath}`
      )
    }
    byPath.set(cleanPath, { path: cleanPath, content: file.content })
  }

  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path))
}

function hasFile(files: BrokCodeRuntimeFile[], filePath: string) {
  return files.some(file => file.path === filePath)
}

function addGeneratedFile({
  files,
  generatedFiles,
  path,
  content
}: {
  files: BrokCodeRuntimeFile[]
  generatedFiles: string[]
  path: string
  content: string
}) {
  if (hasFile(files, path)) return
  files.push({ path, content })
  generatedFiles.push(path)
}

function packageJsonContent({
  appType,
  projectName
}: {
  appType: BrokCodeRuntimeAppType
  projectName: string
}) {
  if (appType === 'nextjs') {
    return JSON.stringify(
      {
        private: true,
        type: 'module',
        scripts: {
          dev: 'next dev -H 0.0.0.0',
          build: 'next build',
          start: 'next start'
        },
        dependencies: {
          '@types/node': 'latest',
          '@types/react': 'latest',
          '@types/react-dom': 'latest',
          next: 'latest',
          react: 'latest',
          'react-dom': 'latest',
          typescript: 'latest'
        },
        name: projectName
      },
      null,
      2
    )
  }

  return JSON.stringify(
    {
      private: true,
      type: 'module',
      scripts: {
        dev: 'vite --host 0.0.0.0',
        build: 'vite build',
        preview: 'vite preview --host 0.0.0.0'
      },
      dependencies: {
        '@vitejs/plugin-react': 'latest',
        vite: 'latest',
        react: 'latest',
        'react-dom': 'latest',
        typescript: 'latest'
      },
      devDependencies: {},
      name: projectName
    },
    null,
    2
  )
}

function ensurePackageJsonScripts({
  files,
  appType,
  projectName
}: {
  files: BrokCodeRuntimeFile[]
  appType: BrokCodeRuntimeAppType
  projectName: string
}) {
  const packageFile = files.find(file => file.path === 'package.json')
  if (!packageFile || (appType !== 'vite_react' && appType !== 'nextjs')) return

  const existing = parseBrokCodePackageJson(files) ?? {}
  const baseline = JSON.parse(
    packageJsonContent({ appType, projectName })
  ) as Record<string, unknown>
  const existingScripts =
    existing.scripts && typeof existing.scripts === 'object'
      ? (existing.scripts as Record<string, unknown>)
      : {}
  const baselineScripts =
    baseline.scripts && typeof baseline.scripts === 'object'
      ? (baseline.scripts as Record<string, unknown>)
      : {}
  const existingDependencies =
    existing.dependencies && typeof existing.dependencies === 'object'
      ? (existing.dependencies as Record<string, unknown>)
      : {}
  const baselineDependencies =
    baseline.dependencies && typeof baseline.dependencies === 'object'
      ? (baseline.dependencies as Record<string, unknown>)
      : {}

  packageFile.content = JSON.stringify(
    {
      ...baseline,
      ...existing,
      private: existing.private ?? true,
      type: existing.type ?? 'module',
      scripts: {
        ...baselineScripts,
        ...existingScripts
      },
      dependencies: {
        ...baselineDependencies,
        ...existingDependencies
      }
    },
    null,
    2
  )
}

function ensureRunnableFiles({
  files,
  appType,
  projectName
}: {
  files: BrokCodeRuntimeFile[]
  appType: BrokCodeRuntimeAppType
  projectName: string
}) {
  const generatedFiles: string[] = []
  ensurePackageJsonScripts({ files, appType, projectName })
  if (appType === 'vite_react') {
    addGeneratedFile({
      files,
      generatedFiles,
      path: 'package.json',
      content: packageJsonContent({ appType, projectName })
    })
    addGeneratedFile({
      files,
      generatedFiles,
      path: 'index.html',
      content:
        '<!doctype html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>BrokCode App</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>'
    })
    if (
      hasFile(files, 'src/App.tsx') &&
      !hasFile(files, 'src/main.tsx') &&
      !hasFile(files, 'src/main.jsx')
    ) {
      addGeneratedFile({
        files,
        generatedFiles,
        path: 'src/main.tsx',
        content:
          "import React from 'react'\nimport { createRoot } from 'react-dom/client'\nimport { App } from './App'\n\ncreateRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)\n"
      })
    }
  }

  if (appType === 'nextjs') {
    addGeneratedFile({
      files,
      generatedFiles,
      path: 'package.json',
      content: packageJsonContent({ appType, projectName })
    })
  }

  return generatedFiles
}

function activeEntrypointFor({
  files,
  appType
}: {
  files: BrokCodeRuntimeFile[]
  appType: BrokCodeRuntimeAppType
}) {
  if (appType === 'static_html') {
    return hasFile(files, 'index.html')
      ? 'index.html'
      : (files.find(file => file.path.endsWith('.html'))?.path ?? null)
  }
  if (appType === 'vite_react') return 'index.html'
  if (appType === 'nextjs') {
    return (
      files.find(file =>
        [
          'app/page.tsx',
          'app/page.jsx',
          'pages/index.tsx',
          'pages/index.jsx'
        ].includes(file.path)
      )?.path ?? 'package.json'
    )
  }
  return null
}

async function readPreviousManifest(workspaceRoot: string) {
  try {
    const raw = await readFile(
      path.join(workspaceRoot, '.brokcode', 'manifest.json'),
      'utf8'
    )
    const parsed = JSON.parse(raw) as Partial<BrokCodeRuntimeWorkspaceManifest>
    const files = Array.isArray(parsed.files) ? parsed.files : []
    const generatedFiles = Array.isArray(parsed.generatedFiles)
      ? parsed.generatedFiles
      : []

    return {
      files: files
        .map(file => (typeof file?.path === 'string' ? file.path : null))
        .filter((filePath): filePath is string => Boolean(filePath)),
      generatedFiles: generatedFiles.filter(
        (filePath): filePath is string => typeof filePath === 'string'
      )
    }
  } catch {
    return null
  }
}

async function pruneStaleRuntimeFiles({
  workspaceRoot,
  previous,
  nextPaths
}: {
  workspaceRoot: string
  previous: Awaited<ReturnType<typeof readPreviousManifest>>
  nextPaths: Set<string>
}) {
  if (!previous) return

  const previousPaths = new Set([...previous.files, ...previous.generatedFiles])
  await Promise.all(
    [...previousPaths].map(async previousPath => {
      if (nextPaths.has(previousPath)) return

      const targetPath = path.resolve(workspaceRoot, previousPath)
      if (!isInsidePath(workspaceRoot, targetPath)) return

      await rm(targetPath, { force: true })
    })
  )
}

export async function materializeBrokCodeRuntimeWorkspace({
  spec,
  files,
  projectName = 'brokcode-app'
}: {
  spec: BrokCodeRuntimeSpec
  files: BrokCodeRuntimeFile[]
  projectName?: string
}) {
  const appType = detectBrokCodeRuntimeAppType(files)
  const preparedFiles = mergeFiles(files)
  const generatedFiles = ensureRunnableFiles({
    files: preparedFiles,
    appType,
    projectName
  })
  const totalBytes = preparedFiles.reduce(
    (sum, file) => sum + Buffer.byteLength(file.content, 'utf8'),
    0
  )
  if (totalBytes > MAX_RUNTIME_TOTAL_BYTES) {
    throw new BrokCodeRuntimeWorkspaceError('Generated project is too large')
  }

  const root = runtimeWorkspaceRoot()
  const workspacePath = path.resolve(process.cwd(), spec.workspacePath)
  const workspaceRoot = isInsidePath(root, workspacePath)
    ? workspacePath
    : path.resolve(
        root,
        spec.workspacePath.replace(/^\.brokcode\/runtime\/?/, '')
      )
  if (!isInsidePath(root, workspaceRoot)) {
    throw new BrokCodeRuntimeWorkspaceError('Invalid runtime workspace path')
  }

  const previousManifest = await readPreviousManifest(workspaceRoot)
  await mkdir(workspaceRoot, { recursive: true })
  const nextPaths = new Set(preparedFiles.map(file => file.path))
  await pruneStaleRuntimeFiles({
    workspaceRoot,
    previous: previousManifest,
    nextPaths
  })

  const manifestFiles: BrokCodeRuntimeManifestFile[] = []
  for (const file of preparedFiles) {
    const targetPath = path.resolve(workspaceRoot, file.path)
    if (!isInsidePath(workspaceRoot, targetPath)) {
      throw new BrokCodeRuntimeWorkspaceError('Invalid file path')
    }
    await mkdir(path.dirname(targetPath), { recursive: true })
    await writeFile(targetPath, file.content, 'utf8')
    manifestFiles.push({
      path: file.path,
      language: inferLanguage(file.path),
      sizeBytes: Buffer.byteLength(file.content, 'utf8'),
      sha256: checksum(file.content)
    })
  }

  const manifest: BrokCodeRuntimeWorkspaceManifest = {
    appType,
    activeEntrypoint: activeEntrypointFor({ files: preparedFiles, appType }),
    workspacePath: workspaceRoot,
    packageManager: spec.packageManager,
    installCommand: spec.installCommand,
    devCommand: spec.devCommand,
    buildCommand: spec.buildCommand,
    files: manifestFiles,
    generatedFiles,
    totalBytes,
    materializedAt: new Date().toISOString()
  }

  await mkdir(path.join(workspaceRoot, '.brokcode'), { recursive: true })
  await writeFile(
    path.join(workspaceRoot, '.brokcode', 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8'
  )

  return {
    workspacePath: workspaceRoot,
    files: preparedFiles,
    manifest
  }
}
