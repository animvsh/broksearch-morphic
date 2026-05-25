import { and, asc, desc, eq, or } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  BrokCodeBackendMetadata,
  emptyBrokCodeBackendMetadata,
  mergeBrokCodeProjectBackendMetadata,
  normalizeBrokCodeBackendMetadata
} from '@/lib/brokcode/backend-provider'
import { db } from '@/lib/db'
import {
  brokCodeDeployments,
  brokCodeProjectFiles,
  brokCodeProjects
} from '@/lib/db/schema'

type BrokCodeProject = typeof brokCodeProjects.$inferSelect
type BrokCodeProjectFile = typeof brokCodeProjectFiles.$inferSelect
type BrokCodeDeployment = typeof brokCodeDeployments.$inferSelect

type BrokCodeProjectStoreFile = {
  projects: BrokCodeProject[]
  files: BrokCodeProjectFile[]
  deployments: BrokCodeDeployment[]
}

const LOCAL_FALLBACK_WORKSPACE_ID = '00000000-0000-0000-0000-000000000000'

let projectWriteQueue: Promise<unknown> = Promise.resolve()

function canUseDatabaseStore() {
  return (
    process.env.BROKCODE_PROJECT_STORAGE !== 'file' &&
    !!process.env.DATABASE_URL
  )
}

function canUseDatabaseStoreForWorkspace(workspaceId: string) {
  if (workspaceId === LOCAL_FALLBACK_WORKSPACE_ID) return false
  return canUseDatabaseStore()
}

function getProjectStorePath() {
  return path.join(
    process.env.BROKCODE_SYNC_DIR ??
      path.join(process.cwd(), '.brokcode', 'sync'),
    'projects.json'
  )
}

function asDate(value: Date | string | null | undefined) {
  if (value instanceof Date) return value
  const parsed = value ? new Date(value) : new Date()
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

function normalizeProject(project: BrokCodeProject): BrokCodeProject {
  return {
    ...project,
    createdAt: asDate(project.createdAt),
    updatedAt: asDate(project.updatedAt)
  }
}

function normalizeProjectFile(file: BrokCodeProjectFile): BrokCodeProjectFile {
  return {
    ...file,
    createdAt: asDate(file.createdAt),
    updatedAt: asDate(file.updatedAt)
  }
}

function normalizeDeployment(
  deployment: BrokCodeDeployment
): BrokCodeDeployment {
  return {
    ...deployment,
    createdAt: asDate(deployment.createdAt),
    updatedAt: asDate(deployment.updatedAt)
  }
}

async function readProjectStore(): Promise<BrokCodeProjectStoreFile> {
  try {
    const raw = await readFile(getProjectStorePath(), 'utf8')
    const parsed = JSON.parse(raw) as BrokCodeProjectStoreFile
    return {
      projects: Array.isArray(parsed.projects)
        ? parsed.projects.map(normalizeProject)
        : [],
      files: Array.isArray(parsed.files)
        ? parsed.files.map(normalizeProjectFile)
        : [],
      deployments: Array.isArray(parsed.deployments)
        ? parsed.deployments.map(normalizeDeployment)
        : []
    }
  } catch {}

  return { projects: [], files: [], deployments: [] }
}

async function writeProjectStore(store: BrokCodeProjectStoreFile) {
  const filePath = getProjectStorePath()
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(store, null, 2), 'utf8')
}

function queueProjectStoreWrite(
  updater: (store: BrokCodeProjectStoreFile) => BrokCodeProjectStoreFile
) {
  projectWriteQueue = projectWriteQueue.then(async () => {
    const store = await readProjectStore()
    await writeProjectStore(updater(store))
  })

  return projectWriteQueue
}

function fallbackProjectStatus(status: string) {
  if (status === 'failed') return 'deploy_failed'
  if (status === 'queued' || status === 'triggered' || status === 'deploying') {
    return 'deploying'
  }
  return 'deployed'
}

export function makeBrokCodeSlug(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)

  return slug || `project-${Date.now().toString(36)}`
}

export async function listBrokCodeProjects({
  workspaceId,
  userId
}: {
  workspaceId: string
  userId: string
}) {
  if (canUseDatabaseStoreForWorkspace(workspaceId)) {
    try {
      return await db
        .select()
        .from(brokCodeProjects)
        .where(
          and(
            eq(brokCodeProjects.workspaceId, workspaceId),
            eq(brokCodeProjects.userId, userId)
          )
        )
        .orderBy(desc(brokCodeProjects.updatedAt))
    } catch (error) {
      console.error('BrokCode project DB list failed; using file store:', error)
    }
  }

  const store = await readProjectStore()
  return store.projects
    .filter(
      project =>
        project.workspaceId === workspaceId && project.userId === userId
    )
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
}

function createProjectValue({
  workspaceId,
  userId,
  name,
  username,
  backend,
  slug
}: {
  workspaceId: string
  userId: string
  name: string
  username?: string | null
  backend?: BrokCodeBackendMetadata
  slug?: string
}) {
  const metadata = mergeBrokCodeProjectBackendMetadata({
    metadata: {
      previewMode: 'managed',
      hotReload: 'pending-worker'
    },
    backend: backend ?? emptyBrokCodeBackendMetadata()
  })

  return {
    workspaceId,
    userId,
    name,
    slug: slug ?? makeBrokCodeSlug(name),
    username: username ? makeBrokCodeSlug(username) : null,
    metadata
  }
}

async function makeUniqueProjectSlug(workspaceId: string, desiredSlug: string) {
  const existingSlugs = new Set<string>()

  if (canUseDatabaseStoreForWorkspace(workspaceId)) {
    try {
      const rows = await db
        .select({ slug: brokCodeProjects.slug })
        .from(brokCodeProjects)
        .where(eq(brokCodeProjects.workspaceId, workspaceId))
      rows.forEach(row => existingSlugs.add(row.slug))
    } catch (error) {
      console.error(
        'BrokCode project slug lookup failed; using file store:',
        error
      )
    }
  }

  const store = await readProjectStore()
  store.projects
    .filter(project => project.workspaceId === workspaceId)
    .forEach(project => existingSlugs.add(project.slug))

  if (!existingSlugs.has(desiredSlug)) return desiredSlug

  for (let index = 2; index < 100; index += 1) {
    const candidate = `${desiredSlug.slice(0, 42)}-${index}`
    if (!existingSlugs.has(candidate)) return candidate
  }

  return `${desiredSlug.slice(0, 36)}-${Date.now().toString(36)}`
}

function createFallbackProject(
  value: ReturnType<typeof createProjectValue>
): BrokCodeProject {
  const now = new Date()
  return {
    id: randomUUID(),
    workspaceId: value.workspaceId,
    userId: value.userId,
    name: value.name,
    slug: value.slug,
    username: value.username,
    status: 'draft',
    previewUrl: null,
    deploymentUrl: null,
    metadata: value.metadata,
    createdAt: now,
    updatedAt: now
  }
}

async function saveFallbackProject(project: BrokCodeProject) {
  await queueProjectStoreWrite(store => {
    const withoutProject = store.projects.filter(item => item.id !== project.id)
    return {
      ...store,
      projects: [...withoutProject, project]
    }
  })

  return project
}

async function updateFallbackProject(
  projectId: string,
  updater: (project: BrokCodeProject) => BrokCodeProject
) {
  let updatedProject: BrokCodeProject | null = null

  await queueProjectStoreWrite(store => ({
    ...store,
    projects: store.projects.map(project => {
      if (project.id !== projectId) return project
      updatedProject = updater(project)
      return updatedProject
    })
  }))

  return updatedProject
}

async function getFallbackProject({
  id,
  workspaceId,
  userId
}: {
  id: string
  workspaceId: string
  userId: string
}) {
  const store = await readProjectStore()
  return (
    store.projects.find(
      project =>
        project.id === id &&
        project.workspaceId === workspaceId &&
        project.userId === userId
    ) ?? null
  )
}

export async function createBrokCodeProject({
  workspaceId,
  userId,
  name,
  username,
  backend
}: {
  workspaceId: string
  userId: string
  name: string
  username?: string | null
  backend?: BrokCodeBackendMetadata
}) {
  const slug = await makeUniqueProjectSlug(workspaceId, makeBrokCodeSlug(name))
  const value = createProjectValue({
    workspaceId,
    userId,
    name,
    username,
    backend,
    slug
  })

  if (canUseDatabaseStoreForWorkspace(workspaceId)) {
    try {
      const [project] = await db
        .insert(brokCodeProjects)
        .values(value)
        .returning()

      return project
    } catch (error) {
      console.error(
        'BrokCode project DB create failed; using file store:',
        error
      )
    }
  }

  return saveFallbackProject(createFallbackProject(value))
}

export async function getBrokCodeProject({
  id,
  workspaceId,
  userId
}: {
  id: string
  workspaceId: string
  userId: string
}) {
  if (canUseDatabaseStoreForWorkspace(workspaceId)) {
    try {
      const [project] = await db
        .select()
        .from(brokCodeProjects)
        .where(
          and(
            eq(brokCodeProjects.id, id),
            eq(brokCodeProjects.workspaceId, workspaceId),
            eq(brokCodeProjects.userId, userId)
          )
        )
        .limit(1)

      return project ?? null
    } catch (error) {
      console.error('BrokCode project DB get failed; using file store:', error)
    }
  }

  return getFallbackProject({ id, workspaceId, userId })
}

export async function getBrokCodeProjectById({ id }: { id: string }) {
  if (canUseDatabaseStore()) {
    try {
      const [project] = await db
        .select()
        .from(brokCodeProjects)
        .where(eq(brokCodeProjects.id, id))
        .limit(1)

      if (project) return project
    } catch (error) {
      console.error(
        'BrokCode project DB public get failed; using file store:',
        error
      )
    }
  }

  const store = await readProjectStore()
  return store.projects.find(project => project.id === id) ?? null
}

export async function getBrokCodeProjectByHandle({
  handle
}: {
  handle: string
}) {
  const rawHandle = decodeURIComponent(handle).trim()
  const [, explicitProjectId] = rawHandle.match(/--([^/]+)$/) ?? []
  if (explicitProjectId) {
    const project = await getBrokCodeProjectById({ id: explicitProjectId })
    if (project) return project
  }

  const normalizedHandle = makeBrokCodeSlug(rawHandle)

  if (canUseDatabaseStore()) {
    try {
      const [project] = await db
        .select()
        .from(brokCodeProjects)
        .where(
          or(
            eq(brokCodeProjects.slug, normalizedHandle),
            eq(brokCodeProjects.username, normalizedHandle)
          )
        )
        .orderBy(desc(brokCodeProjects.updatedAt))
        .limit(1)

      if (project) return project
    } catch (error) {
      console.error(
        'BrokCode project DB public handle get failed; using file store:',
        error
      )
    }
  }

  const store = await readProjectStore()
  return (
    store.projects
      .filter(
        project =>
          project.slug === normalizedHandle ||
          project.username === normalizedHandle
      )
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )[0] ?? null
  )
}

export async function updateBrokCodeProjectBackend({
  projectId,
  workspaceId,
  userId,
  backend
}: {
  projectId: string
  workspaceId: string
  userId: string
  backend: BrokCodeBackendMetadata
}) {
  const project = await getBrokCodeProject({
    id: projectId,
    workspaceId,
    userId
  })
  if (!project) return null

  const metadata = mergeBrokCodeProjectBackendMetadata({
    metadata: project.metadata,
    backend
  })
  if (canUseDatabaseStoreForWorkspace(workspaceId)) {
    try {
      const [updatedProject] = await db
        .update(brokCodeProjects)
        .set({
          metadata,
          updatedAt: new Date()
        })
        .where(eq(brokCodeProjects.id, projectId))
        .returning()

      return updatedProject ?? null
    } catch (error) {
      console.error(
        'BrokCode project DB backend update failed; using file store:',
        error
      )
    }
  }

  return updateFallbackProject(projectId, current => ({
    ...current,
    metadata,
    updatedAt: new Date()
  }))
}

export async function updateBrokCodeProjectPreview({
  projectId,
  workspaceId,
  userId,
  previewUrl,
  deploymentUrl,
  status = 'preview_ready',
  metadata
}: {
  projectId: string
  workspaceId: string
  userId: string
  previewUrl: string
  deploymentUrl?: string | null
  status?: string
  metadata?: Record<string, unknown> | null
}) {
  const project = await getBrokCodeProject({
    id: projectId,
    workspaceId,
    userId
  })
  if (!project) return null

  const nextMetadata = metadata
    ? {
        ...(project.metadata ?? {}),
        preview: {
          ...((project.metadata?.preview as Record<string, unknown>) ?? {}),
          ...metadata
        }
      }
    : project.metadata

  if (canUseDatabaseStoreForWorkspace(workspaceId)) {
    try {
      const [updatedProject] = await db
        .update(brokCodeProjects)
        .set({
          status,
          previewUrl,
          deploymentUrl: deploymentUrl ?? project.deploymentUrl,
          metadata: nextMetadata,
          updatedAt: new Date()
        })
        .where(eq(brokCodeProjects.id, projectId))
        .returning()

      return updatedProject ?? null
    } catch (error) {
      console.error(
        'BrokCode project DB preview update failed; using file store:',
        error
      )
    }
  }

  return updateFallbackProject(projectId, current => ({
    ...current,
    status,
    previewUrl,
    deploymentUrl: deploymentUrl ?? current.deploymentUrl,
    metadata: nextMetadata,
    updatedAt: new Date()
  }))
}

export async function updateBrokCodeProjectMetadata({
  projectId,
  workspaceId,
  userId,
  metadata
}: {
  projectId: string
  workspaceId: string
  userId: string
  metadata: Record<string, unknown>
}) {
  const project = await getBrokCodeProject({
    id: projectId,
    workspaceId,
    userId
  })
  if (!project) return null

  const nextMetadata = {
    ...(project.metadata ?? {}),
    ...metadata
  }

  if (canUseDatabaseStoreForWorkspace(workspaceId)) {
    try {
      const [updatedProject] = await db
        .update(brokCodeProjects)
        .set({
          metadata: nextMetadata,
          updatedAt: new Date()
        })
        .where(eq(brokCodeProjects.id, projectId))
        .returning()

      return updatedProject ?? null
    } catch (error) {
      console.error(
        'BrokCode project DB metadata update failed; using file store:',
        error
      )
    }
  }

  return updateFallbackProject(projectId, current => ({
    ...current,
    metadata: nextMetadata,
    updatedAt: new Date()
  }))
}

export function getBrokCodeProjectBackend(
  project: { metadata?: Record<string, unknown> | null } | null | undefined
) {
  return normalizeBrokCodeBackendMetadata(project?.metadata?.backend)
}

export async function recordBrokCodeProjectDeployment({
  projectId,
  workspaceId,
  userId,
  provider,
  status,
  url,
  subdomain,
  logs,
  metadata
}: {
  projectId: string
  workspaceId: string
  userId: string
  provider: string
  status: string
  url?: string | null
  subdomain?: string | null
  logs?: Array<Record<string, unknown>> | null
  metadata?: Record<string, unknown> | null
}) {
  const now = new Date()
  const deploymentPreviewUrl =
    typeof metadata?.previewUrl === 'string' && metadata.previewUrl.trim()
      ? metadata.previewUrl.trim()
      : url
  const value = {
    projectId,
    workspaceId,
    userId,
    provider,
    status,
    url: url ?? null,
    subdomain: subdomain ?? null,
    logs: logs ?? null,
    metadata: metadata ?? null,
    updatedAt: now
  }

  if (canUseDatabaseStoreForWorkspace(workspaceId)) {
    try {
      const [deployment] = await db
        .insert(brokCodeDeployments)
        .values(value)
        .returning()

      await db
        .update(brokCodeProjects)
        .set({
          status: fallbackProjectStatus(status),
          deploymentUrl: url ?? null,
          previewUrl: deploymentPreviewUrl ?? null,
          updatedAt: now
        })
        .where(eq(brokCodeProjects.id, projectId))

      return deployment
    } catch (error) {
      console.error(
        'BrokCode project DB deployment failed; using file store:',
        error
      )
    }
  }

  const deployment: BrokCodeDeployment = {
    id: randomUUID(),
    ...value,
    createdAt: now,
    updatedAt: now
  }

  await queueProjectStoreWrite(store => ({
    ...store,
    deployments: [...store.deployments, deployment],
    projects: store.projects.map(project =>
      project.id === projectId
        ? {
            ...project,
            status: fallbackProjectStatus(status),
            deploymentUrl: url ?? null,
            previewUrl: deploymentPreviewUrl ?? null,
            updatedAt: now
          }
        : project
    )
  }))

  return deployment
}

export async function listBrokCodeProjectFiles({
  projectId,
  workspaceId
}: {
  projectId: string
  workspaceId: string
}) {
  if (canUseDatabaseStoreForWorkspace(workspaceId)) {
    try {
      return await db
        .select()
        .from(brokCodeProjectFiles)
        .where(
          and(
            eq(brokCodeProjectFiles.projectId, projectId),
            eq(brokCodeProjectFiles.workspaceId, workspaceId)
          )
        )
        .orderBy(asc(brokCodeProjectFiles.path))
    } catch (error) {
      console.error(
        'BrokCode project file DB list failed; using file store:',
        error
      )
    }
  }

  const store = await readProjectStore()
  return store.files
    .filter(
      file => file.projectId === projectId && file.workspaceId === workspaceId
    )
    .sort((a, b) => a.path.localeCompare(b.path))
}

export async function listBrokCodeProjectFilesByProjectId({
  projectId
}: {
  projectId: string
}) {
  if (canUseDatabaseStore()) {
    try {
      const rows = await db
        .select()
        .from(brokCodeProjectFiles)
        .where(eq(brokCodeProjectFiles.projectId, projectId))
        .orderBy(asc(brokCodeProjectFiles.path))
      if (rows.length > 0) return rows
    } catch (error) {
      console.error(
        'BrokCode project file DB public list failed; using file store:',
        error
      )
    }
  }

  const store = await readProjectStore()
  return store.files
    .filter(file => file.projectId === projectId)
    .sort((a, b) => a.path.localeCompare(b.path))
}

export async function upsertBrokCodeProjectFile({
  projectId,
  workspaceId,
  path,
  content,
  language
}: {
  projectId: string
  workspaceId: string
  path: string
  content: string
  language?: string | null
}) {
  const rawPath = path.trim()
  const cleanPath = rawPath.replace(/\\/g, '/')

  if (
    !cleanPath ||
    cleanPath.startsWith('/') ||
    cleanPath.split('/').some(part => !part || part === '.' || part === '..')
  ) {
    throw new Error('Invalid file path')
  }

  const now = new Date()
  const fileValue = {
    projectId,
    workspaceId,
    path: cleanPath,
    content,
    language: language ?? inferLanguage(cleanPath),
    updatedAt: now
  }

  if (canUseDatabaseStoreForWorkspace(workspaceId)) {
    try {
      const [file] = await db
        .insert(brokCodeProjectFiles)
        .values(fileValue)
        .onConflictDoUpdate({
          target: [brokCodeProjectFiles.projectId, brokCodeProjectFiles.path],
          set: {
            content,
            language: language ?? inferLanguage(cleanPath),
            updatedAt: now
          }
        })
        .returning()

      await db
        .update(brokCodeProjects)
        .set({ updatedAt: now })
        .where(eq(brokCodeProjects.id, projectId))

      return file
    } catch (error) {
      console.error(
        'BrokCode project file DB upsert failed; using file store:',
        error
      )
    }
  }

  let upsertedFile: BrokCodeProjectFile | null = null

  await queueProjectStoreWrite(store => {
    const existing = store.files.find(
      file => file.projectId === projectId && file.path === cleanPath
    )
    upsertedFile = {
      id: existing?.id ?? randomUUID(),
      ...fileValue,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    }

    return {
      ...store,
      files: [
        ...store.files.filter(
          file => !(file.projectId === projectId && file.path === cleanPath)
        ),
        upsertedFile
      ],
      projects: store.projects.map(project =>
        project.id === projectId ? { ...project, updatedAt: now } : project
      )
    }
  })

  if (!upsertedFile) {
    throw new Error('Failed to store project file')
  }

  return upsertedFile
}

export async function deleteBrokCodeProjectFile({
  projectId,
  workspaceId,
  path
}: {
  projectId: string
  workspaceId: string
  path: string
}) {
  const now = new Date()
  if (canUseDatabaseStoreForWorkspace(workspaceId)) {
    try {
      await db
        .delete(brokCodeProjectFiles)
        .where(
          and(
            eq(brokCodeProjectFiles.projectId, projectId),
            eq(brokCodeProjectFiles.workspaceId, workspaceId),
            eq(brokCodeProjectFiles.path, path)
          )
        )
      await db
        .update(brokCodeProjects)
        .set({ updatedAt: now })
        .where(eq(brokCodeProjects.id, projectId))
      return
    } catch (error) {
      console.error(
        'BrokCode project file DB delete failed; using file store:',
        error
      )
    }
  }

  await queueProjectStoreWrite(store => ({
    ...store,
    files: store.files.filter(
      file =>
        !(
          file.projectId === projectId &&
          file.workspaceId === workspaceId &&
          file.path === path
        )
    ),
    projects: store.projects.map(project =>
      project.id === projectId ? { ...project, updatedAt: now } : project
    )
  }))
}

export async function renameBrokCodeProjectFile({
  projectId,
  workspaceId,
  fromPath,
  toPath
}: {
  projectId: string
  workspaceId: string
  fromPath: string
  toPath: string
}) {
  const now = new Date()
  if (canUseDatabaseStoreForWorkspace(workspaceId)) {
    try {
      const [file] = await db
        .update(brokCodeProjectFiles)
        .set({ path: toPath, updatedAt: now })
        .where(
          and(
            eq(brokCodeProjectFiles.projectId, projectId),
            eq(brokCodeProjectFiles.workspaceId, workspaceId),
            eq(brokCodeProjectFiles.path, fromPath)
          )
        )
        .returning()
      await db
        .update(brokCodeProjects)
        .set({ updatedAt: now })
        .where(eq(brokCodeProjects.id, projectId))
      return file ?? null
    } catch (error) {
      console.error(
        'BrokCode project file DB rename failed; using file store:',
        error
      )
    }
  }

  let renamedFile: BrokCodeProjectFile | null = null
  await queueProjectStoreWrite(store => ({
    ...store,
    files: store.files.map(file => {
      if (
        file.projectId !== projectId ||
        file.workspaceId !== workspaceId ||
        file.path !== fromPath
      ) {
        return file
      }

      renamedFile = { ...file, path: toPath, updatedAt: now }
      return renamedFile
    }),
    projects: store.projects.map(project =>
      project.id === projectId ? { ...project, updatedAt: now } : project
    )
  }))

  return renamedFile
}

function inferLanguage(path: string) {
  if (path.endsWith('.tsx')) return 'tsx'
  if (path.endsWith('.ts')) return 'ts'
  if (path.endsWith('.jsx')) return 'jsx'
  if (path.endsWith('.js')) return 'js'
  if (path.endsWith('.css')) return 'css'
  if (path.endsWith('.json')) return 'json'
  if (path.endsWith('.md')) return 'markdown'
  return 'text'
}
