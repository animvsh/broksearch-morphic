import { and, asc, eq } from 'drizzle-orm'

import { db } from '@/lib/db'
import { brokCodeProjectFiles, brokCodeProjects } from '@/lib/db/schema'

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
  return db
    .select()
    .from(brokCodeProjects)
    .where(
      and(
        eq(brokCodeProjects.workspaceId, workspaceId),
        eq(brokCodeProjects.userId, userId)
      )
    )
    .orderBy(asc(brokCodeProjects.createdAt))
}

export async function createBrokCodeProject({
  workspaceId,
  userId,
  name,
  username
}: {
  workspaceId: string
  userId: string
  name: string
  username?: string | null
}) {
  const slug = makeBrokCodeSlug(name)
  const [project] = await db
    .insert(brokCodeProjects)
    .values({
      workspaceId,
      userId,
      name,
      slug,
      username: username ? makeBrokCodeSlug(username) : null,
      metadata: {
        previewMode: 'managed',
        hotReload: 'pending-worker'
      }
    })
    .returning()

  return project
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
}

export async function listBrokCodeProjectFiles({
  projectId,
  workspaceId
}: {
  projectId: string
  workspaceId: string
}) {
  return db
    .select()
    .from(brokCodeProjectFiles)
    .where(
      and(
        eq(brokCodeProjectFiles.projectId, projectId),
        eq(brokCodeProjectFiles.workspaceId, workspaceId)
      )
    )
    .orderBy(asc(brokCodeProjectFiles.path))
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
  const cleanPath = path
    .trim()
    .replace(/^\/+/, '')
    .replace(/\.\.(\/|\\)/g, '')

  if (!cleanPath) {
    throw new Error('File path is required')
  }

  const [file] = await db
    .insert(brokCodeProjectFiles)
    .values({
      projectId,
      workspaceId,
      path: cleanPath,
      content,
      language: language ?? inferLanguage(cleanPath),
      updatedAt: new Date()
    })
    .onConflictDoUpdate({
      target: [brokCodeProjectFiles.projectId, brokCodeProjectFiles.path],
      set: {
        content,
        language: language ?? inferLanguage(cleanPath),
        updatedAt: new Date()
      }
    })
    .returning()

  await db
    .update(brokCodeProjects)
    .set({ updatedAt: new Date() })
    .where(eq(brokCodeProjects.id, projectId))

  return file
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
