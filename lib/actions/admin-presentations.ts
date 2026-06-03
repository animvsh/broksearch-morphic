'use server'

import { revalidatePath } from 'next/cache'

import { desc, eq, inArray, sql } from 'drizzle-orm'

import { requireAdminAccess } from '@/lib/auth/admin'
import { db } from '@/lib/db'
import {
  presentationAssets,
  presentationExports,
  presentationGenerations,
  presentationOutlines,
  presentations,
  presentationShares,
  presentationSlides,
  presentationThemes,
  workspaces
} from '@/lib/db/schema'

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function canUseDevDbFallback(error: unknown): boolean {
  if (process.env.BROK_DEV_DB_FALLBACK === 'false') {
    return false
  }

  const message = getErrorMessage(error).toLowerCase()
  return [
    'enotfound',
    'ehostunreach',
    'econnrefused',
    'etimedout',
    'network',
    'connect econn',
    'getaddrinfo',
    'failed query',
    'connection terminated',
    'unable to connect'
  ].some(fragment => message.includes(fragment))
}

async function assertAdminAccess() {
  const access = await requireAdminAccess()
  if (!access.ok) {
    throw new Error(access.error)
  }
}

function asNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0
  const parsed = typeof value === 'string' ? Number(value) : value
  return Number.isFinite(parsed) ? parsed : 0
}

function asDate(value: Date | string | null | undefined): Date {
  if (value instanceof Date) return value
  if (!value) return new Date(0)
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed
}

function revalidatePresentationsPaths(presentationId?: string) {
  revalidatePath('/admin/presentations')
  revalidatePath('/admin/presentations/decks')
  revalidatePath('/admin/presentations/generations')
  revalidatePath('/admin/presentations/slides')
  revalidatePath('/admin/presentations/themes')
  revalidatePath('/admin/presentations/assets')
  revalidatePath('/admin/presentations/exports')
  revalidatePath('/admin/presentations/shares')
  revalidatePath('/admin/presentations/costs')
  if (presentationId) {
    revalidatePath(`/admin/presentations/decks/${presentationId}`)
  }
}

export type AdminDeckRow = {
  id: string
  title: string
  ownerId: string
  workspaceId: string | null
  workspaceName: string
  slideCount: number
  themeId: string | null
  style: string | null
  language: string
  status: string
  isPublic: boolean
  exportCount: number
  costCents: number
  createdAt: Date
  updatedAt: Date
}

export async function getAllDecksForAdmin(): Promise<AdminDeckRow[]> {
  await assertAdminAccess()

  try {
    const rows = await db
      .select({
        id: presentations.id,
        title: presentations.title,
        ownerId: presentations.userId,
        workspaceId: presentations.workspaceId,
        workspaceName: workspaces.name,
        slideCount: presentations.slideCount,
        themeId: presentations.themeId,
        style: presentations.style,
        language: presentations.language,
        status: presentations.status,
        isPublic: presentations.isPublic,
        createdAt: presentations.createdAt,
        updatedAt: presentations.updatedAt
      })
      .from(presentations)
      .leftJoin(workspaces, eq(presentations.workspaceId, workspaces.id))
      .orderBy(desc(presentations.updatedAt))

    if (rows.length === 0) return []

    const presentationIds = rows.map(r => r.id)

    const exportCounts = await db
      .select({
        presentationId: presentationExports.presentationId,
        count: sql<number>`count(*)::int`
      })
      .from(presentationExports)
      .where(inArray(presentationExports.presentationId, presentationIds))
      .groupBy(presentationExports.presentationId)

    const costStats = await db
      .select({
        presentationId: presentationGenerations.presentationId,
        totalCost: sql<number>`coalesce(sum(${presentationGenerations.costUsd}), 0)::int`
      })
      .from(presentationGenerations)
      .where(inArray(presentationGenerations.presentationId, presentationIds))
      .groupBy(presentationGenerations.presentationId)

    const exportCountByDeck = new Map(
      exportCounts.map(e => [e.presentationId, Number(e.count) || 0])
    )
    const costByDeck = new Map(
      costStats.map(c => [c.presentationId, Number(c.totalCost) || 0])
    )

    return rows.map(row => ({
      id: row.id,
      title: row.title,
      ownerId: row.ownerId,
      workspaceId: row.workspaceId,
      workspaceName: row.workspaceName ?? 'Unknown',
      slideCount: Number(row.slideCount) || 0,
      themeId: row.themeId,
      style: row.style,
      language: row.language,
      status: row.status,
      isPublic: row.isPublic,
      exportCount: exportCountByDeck.get(row.id) ?? 0,
      costCents: costByDeck.get(row.id) ?? 0,
      createdAt: asDate(row.createdAt),
      updatedAt: asDate(row.updatedAt)
    }))
  } catch (error) {
    if (canUseDevDbFallback(error)) return []
    throw error
  }
}

export type AdminDeckDetail = AdminDeckRow & {
  description: string | null
  shareId: string | null
  model: string | null
  totalTokens: number
  imageCount: number
  shareCount: number
  outlineStatus: string | null
  sourceMarkdownLength: number
}

export async function getDeckForAdmin(
  presentationId: string
): Promise<AdminDeckDetail | null> {
  await assertAdminAccess()

  try {
    const [deck] = await db
      .select({
        id: presentations.id,
        title: presentations.title,
        description: presentations.description,
        ownerId: presentations.userId,
        workspaceId: presentations.workspaceId,
        workspaceName: workspaces.name,
        slideCount: presentations.slideCount,
        themeId: presentations.themeId,
        style: presentations.style,
        language: presentations.language,
        status: presentations.status,
        isPublic: presentations.isPublic,
        shareId: presentations.shareId,
        sourceMarkdown: presentations.sourceMarkdown,
        createdAt: presentations.createdAt,
        updatedAt: presentations.updatedAt
      })
      .from(presentations)
      .leftJoin(workspaces, eq(presentations.workspaceId, workspaces.id))
      .where(eq(presentations.id, presentationId))
      .limit(1)

    if (!deck) return null

    const [outline] = await db
      .select({ status: presentationOutlines.status })
      .from(presentationOutlines)
      .where(eq(presentationOutlines.presentationId, presentationId))
      .limit(1)

    const [latestGeneration] = await db
      .select({
        model: presentationGenerations.model,
        totalTokens: sql<number>`(coalesce(${presentationGenerations.inputTokens}, 0) + coalesce(${presentationGenerations.outputTokens}, 0))::int`
      })
      .from(presentationGenerations)
      .where(eq(presentationGenerations.presentationId, presentationId))
      .orderBy(desc(presentationGenerations.createdAt))
      .limit(1)

    const [tokenStats] = await db
      .select({
        total: sql<number>`(coalesce(sum(${presentationGenerations.inputTokens}), 0) + coalesce(sum(${presentationGenerations.outputTokens}), 0))::int`
      })
      .from(presentationGenerations)
      .where(eq(presentationGenerations.presentationId, presentationId))

    const [imageCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(presentationAssets)
      .where(eq(presentationAssets.presentationId, presentationId))

    const [shareCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(presentationShares)
      .where(eq(presentationShares.presentationId, presentationId))

    const [exportCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(presentationExports)
      .where(eq(presentationExports.presentationId, presentationId))

    return {
      id: deck.id,
      title: deck.title,
      description: deck.description,
      ownerId: deck.ownerId,
      workspaceId: deck.workspaceId,
      workspaceName: deck.workspaceName ?? 'Unknown',
      slideCount: Number(deck.slideCount) || 0,
      themeId: deck.themeId,
      style: deck.style,
      language: deck.language,
      status: deck.status,
      isPublic: deck.isPublic,
      exportCount: Number(exportCount?.count) || 0,
      costCents: 0,
      shareId: deck.shareId,
      model: latestGeneration?.model ?? null,
      totalTokens: Number(tokenStats?.total) || 0,
      imageCount: Number(imageCount?.count) || 0,
      shareCount: Number(shareCount?.count) || 0,
      outlineStatus: outline?.status ?? null,
      sourceMarkdownLength: deck.sourceMarkdown?.length ?? 0,
      createdAt: asDate(deck.createdAt),
      updatedAt: asDate(deck.updatedAt)
    }
  } catch (error) {
    if (canUseDevDbFallback(error)) return null
    throw error
  }
}

export type AdminPresentationSlideRow = {
  id: string
  presentationId: string
  presentationTitle: string
  workspaceName: string
  slideIndex: number
  title: string
  layoutType: string
  hasNotes: boolean
  updatedAt: Date
}

export async function getPresentationSlidesForAdmin(
  presentationId?: string
): Promise<AdminPresentationSlideRow[]> {
  await assertAdminAccess()

  try {
    const baseQuery = db
      .select({
        id: presentationSlides.id,
        presentationId: presentationSlides.presentationId,
        presentationTitle: presentations.title,
        workspaceName: workspaces.name,
        slideIndex: presentationSlides.slideIndex,
        title: presentationSlides.title,
        layoutType: presentationSlides.layoutType,
        speakerNotes: presentationSlides.speakerNotes,
        updatedAt: presentationSlides.updatedAt
      })
      .from(presentationSlides)
      .leftJoin(
        presentations,
        eq(presentationSlides.presentationId, presentations.id)
      )
      .leftJoin(workspaces, eq(presentations.workspaceId, workspaces.id))
      .orderBy(desc(presentationSlides.updatedAt))
      .limit(500)

    const rows = presentationId
      ? await baseQuery.where(
          eq(presentationSlides.presentationId, presentationId)
        )
      : await baseQuery

    return rows.map(row => ({
      id: row.id,
      presentationId: row.presentationId,
      presentationTitle: row.presentationTitle ?? 'Unknown',
      workspaceName: row.workspaceName ?? 'Unknown',
      slideIndex: Number(row.slideIndex) || 0,
      title: row.title,
      layoutType: row.layoutType,
      hasNotes: !!row.speakerNotes,
      updatedAt: asDate(row.updatedAt)
    }))
  } catch (error) {
    if (canUseDevDbFallback(error)) return []
    throw error
  }
}

export type AdminPresentationThemeRow = {
  id: string
  name: string
  isBuiltin: boolean
  ownerId: string | null
  updatedAt: Date
}

export async function getPresentationThemesForAdmin(): Promise<
  AdminPresentationThemeRow[]
> {
  await assertAdminAccess()

  try {
    const rows = await db
      .select({
        id: presentationThemes.id,
        name: presentationThemes.name,
        isBuiltin: presentationThemes.isBuiltin,
        ownerId: presentationThemes.userId,
        updatedAt: presentationThemes.updatedAt
      })
      .from(presentationThemes)
      .orderBy(desc(presentationThemes.updatedAt))
      .limit(500)

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      isBuiltin: row.isBuiltin,
      ownerId: row.ownerId,
      updatedAt: asDate(row.updatedAt)
    }))
  } catch (error) {
    if (canUseDevDbFallback(error)) return []
    throw error
  }
}

export type AdminPresentationAssetRow = {
  id: string
  presentationId: string
  presentationTitle: string
  workspaceName: string
  assetType: string
  url: string | null
  provider: string
  prompt: string | null
  createdAt: Date
}

export async function getPresentationAssetsForAdmin(
  presentationId?: string
): Promise<AdminPresentationAssetRow[]> {
  await assertAdminAccess()

  try {
    const baseQuery = db
      .select({
        id: presentationAssets.id,
        presentationId: presentationAssets.presentationId,
        presentationTitle: presentations.title,
        workspaceName: workspaces.name,
        assetType: presentationAssets.assetType,
        url: presentationAssets.url,
        provider: presentationAssets.provider,
        prompt: presentationAssets.prompt,
        createdAt: presentationAssets.createdAt
      })
      .from(presentationAssets)
      .leftJoin(
        presentations,
        eq(presentationAssets.presentationId, presentations.id)
      )
      .leftJoin(workspaces, eq(presentations.workspaceId, workspaces.id))
      .orderBy(desc(presentationAssets.createdAt))
      .limit(500)

    const rows = presentationId
      ? await baseQuery.where(
          eq(presentationAssets.presentationId, presentationId)
        )
      : await baseQuery

    return rows.map(row => ({
      id: row.id,
      presentationId: row.presentationId,
      presentationTitle: row.presentationTitle ?? 'Unknown',
      workspaceName: row.workspaceName ?? 'Unknown',
      assetType: row.assetType,
      url: row.url,
      provider: row.provider,
      prompt: row.prompt,
      createdAt: asDate(row.createdAt)
    }))
  } catch (error) {
    if (canUseDevDbFallback(error)) return []
    throw error
  }
}

export type AdminPresentationGenerationRow = {
  id: string
  presentationId: string
  presentationTitle: string
  workspaceName: string
  ownerId: string
  prompt: string
  generationType: string
  model: string
  webSearchEnabled: boolean
  inputTokens: number
  outputTokens: number
  costCents: number
  status: string
  createdAt: Date
}

export async function getPresentationGenerationsForAdmin(
  presentationId?: string
): Promise<AdminPresentationGenerationRow[]> {
  await assertAdminAccess()

  try {
    const baseQuery = db
      .select({
        id: presentationGenerations.id,
        presentationId: presentationGenerations.presentationId,
        presentationTitle: presentations.title,
        workspaceName: workspaces.name,
        ownerId: presentationGenerations.userId,
        prompt: presentationGenerations.prompt,
        generationType: presentationGenerations.generationType,
        model: presentationGenerations.model,
        webSearchEnabled: presentationGenerations.webSearchEnabled,
        inputTokens: presentationGenerations.inputTokens,
        outputTokens: presentationGenerations.outputTokens,
        costUsd: presentationGenerations.costUsd,
        status: presentationGenerations.status,
        createdAt: presentationGenerations.createdAt
      })
      .from(presentationGenerations)
      .leftJoin(
        presentations,
        eq(presentationGenerations.presentationId, presentations.id)
      )
      .leftJoin(workspaces, eq(presentations.workspaceId, workspaces.id))
      .orderBy(desc(presentationGenerations.createdAt))
      .limit(500)

    const rows = presentationId
      ? await baseQuery.where(
          eq(presentationGenerations.presentationId, presentationId)
        )
      : await baseQuery

    return rows.map(row => ({
      id: row.id,
      presentationId: row.presentationId,
      presentationTitle: row.presentationTitle ?? 'Unknown',
      workspaceName: row.workspaceName ?? 'Unknown',
      ownerId: row.ownerId,
      prompt: row.prompt,
      generationType: row.generationType,
      model: row.model,
      webSearchEnabled: row.webSearchEnabled,
      inputTokens: Number(row.inputTokens) || 0,
      outputTokens: Number(row.outputTokens) || 0,
      costCents: Number(row.costUsd) || 0,
      status: row.status,
      createdAt: asDate(row.createdAt)
    }))
  } catch (error) {
    if (canUseDevDbFallback(error)) return []
    throw error
  }
}

export type AdminPresentationExportRow = {
  id: string
  presentationId: string
  presentationTitle: string
  workspaceName: string
  exportType: string
  fileUrl: string | null
  status: string
  createdAt: Date
}

export async function getPresentationExportsForAdmin(
  presentationId?: string
): Promise<AdminPresentationExportRow[]> {
  await assertAdminAccess()

  try {
    const baseQuery = db
      .select({
        id: presentationExports.id,
        presentationId: presentationExports.presentationId,
        presentationTitle: presentations.title,
        workspaceName: workspaces.name,
        exportType: presentationExports.exportType,
        fileUrl: presentationExports.fileUrl,
        status: presentationExports.status,
        createdAt: presentationExports.createdAt
      })
      .from(presentationExports)
      .leftJoin(
        presentations,
        eq(presentationExports.presentationId, presentations.id)
      )
      .leftJoin(workspaces, eq(presentations.workspaceId, workspaces.id))
      .orderBy(desc(presentationExports.createdAt))
      .limit(500)

    const rows = presentationId
      ? await baseQuery.where(
          eq(presentationExports.presentationId, presentationId)
        )
      : await baseQuery

    return rows.map(row => ({
      id: row.id,
      presentationId: row.presentationId,
      presentationTitle: row.presentationTitle ?? 'Unknown',
      workspaceName: row.workspaceName ?? 'Unknown',
      exportType: row.exportType,
      fileUrl: row.fileUrl,
      status: row.status,
      createdAt: asDate(row.createdAt)
    }))
  } catch (error) {
    if (canUseDevDbFallback(error)) return []
    throw error
  }
}

export type AdminPresentationShareRow = {
  id: string
  presentationId: string
  presentationTitle: string
  workspaceName: string
  shareId: string
  isPublic: boolean
  status: string
  viewCount: number
  lastViewedAt: Date | null
  expiresAt: Date | null
  createdAt: Date
}

export async function getPresentationSharesForAdmin(
  presentationId?: string
): Promise<AdminPresentationShareRow[]> {
  await assertAdminAccess()

  try {
    const baseQuery = db
      .select({
        id: presentationShares.id,
        presentationId: presentationShares.presentationId,
        presentationTitle: presentations.title,
        workspaceName: workspaces.name,
        shareId: presentationShares.shareId,
        isPublic: presentationShares.isPublic,
        status: presentationShares.status,
        viewCount: presentationShares.viewCount,
        lastViewedAt: presentationShares.lastViewedAt,
        expiresAt: presentationShares.expiresAt,
        createdAt: presentationShares.createdAt
      })
      .from(presentationShares)
      .leftJoin(
        presentations,
        eq(presentationShares.presentationId, presentations.id)
      )
      .leftJoin(workspaces, eq(presentations.workspaceId, workspaces.id))
      .orderBy(desc(presentationShares.createdAt))
      .limit(500)

    const rows = presentationId
      ? await baseQuery.where(
          eq(presentationShares.presentationId, presentationId)
        )
      : await baseQuery

    return rows.map(row => ({
      id: row.id,
      presentationId: row.presentationId,
      presentationTitle: row.presentationTitle ?? 'Unknown',
      workspaceName: row.workspaceName ?? 'Unknown',
      shareId: row.shareId,
      isPublic: row.isPublic,
      status: row.status,
      viewCount: Number(row.viewCount) || 0,
      lastViewedAt: row.lastViewedAt ? asDate(row.lastViewedAt) : null,
      expiresAt: row.expiresAt ? asDate(row.expiresAt) : null,
      createdAt: asDate(row.createdAt)
    }))
  } catch (error) {
    if (canUseDevDbFallback(error)) return []
    throw error
  }
}

export type AdminPresentationCostRow = {
  presentationId: string
  presentationTitle: string
  workspaceName: string
  ownerId: string
  status: string
  generations: number
  totalTokens: number
  costCents: number
  updatedAt: Date
}

export async function getPresentationCostsForAdmin(): Promise<
  AdminPresentationCostRow[]
> {
  await assertAdminAccess()

  try {
    const decks = await db
      .select({
        id: presentations.id,
        title: presentations.title,
        ownerId: presentations.userId,
        workspaceName: workspaces.name,
        status: presentations.status,
        updatedAt: presentations.updatedAt
      })
      .from(presentations)
      .leftJoin(workspaces, eq(presentations.workspaceId, workspaces.id))
      .orderBy(desc(presentations.updatedAt))
      .limit(500)

    if (decks.length === 0) return []

    const presentationIds = decks.map(d => d.id)

    const stats = await db
      .select({
        presentationId: presentationGenerations.presentationId,
        count: sql<number>`count(*)::int`,
        totalCost: sql<number>`coalesce(sum(${presentationGenerations.costUsd}), 0)::int`,
        totalInput: sql<number>`coalesce(sum(${presentationGenerations.inputTokens}), 0)::int`,
        totalOutput: sql<number>`coalesce(sum(${presentationGenerations.outputTokens}), 0)::int`
      })
      .from(presentationGenerations)
      .where(inArray(presentationGenerations.presentationId, presentationIds))
      .groupBy(presentationGenerations.presentationId)

    const statsByDeck = new Map(
      stats.map(s => [
        s.presentationId,
        {
          count: Number(s.count) || 0,
          totalCost: Number(s.totalCost) || 0,
          totalInput: Number(s.totalInput) || 0,
          totalOutput: Number(s.totalOutput) || 0
        }
      ])
    )

    return decks.map(deck => {
      const s = statsByDeck.get(deck.id)
      return {
        presentationId: deck.id,
        presentationTitle: deck.title,
        workspaceName: deck.workspaceName ?? 'Unknown',
        ownerId: deck.ownerId,
        status: deck.status,
        generations: s?.count ?? 0,
        totalTokens: (s?.totalInput ?? 0) + (s?.totalOutput ?? 0),
        costCents: s?.totalCost ?? 0,
        updatedAt: asDate(deck.updatedAt)
      }
    })
  } catch (error) {
    if (canUseDevDbFallback(error)) return []
    throw error
  }
}

export async function refundPresentationGeneration(formData: FormData) {
  await assertAdminAccess()
  const id = String(formData.get('id') ?? '').trim()
  if (!id) throw new Error('Generation id is required')

  try {
    await db
      .update(presentationGenerations)
      .set({ costUsd: 0 })
      .where(eq(presentationGenerations.id, id))
  } catch (error) {
    if (!canUseDevDbFallback(error)) throw error
  }
  revalidatePresentationsPaths()
}

export async function setPresentationStatus(formData: FormData) {
  await assertAdminAccess()
  const id = String(formData.get('id') ?? '').trim()
  const status = String(formData.get('status') ?? '').trim()
  if (!id || !status) {
    throw new Error('Presentation id and status are required')
  }

  try {
    await db
      .update(presentations)
      .set({
        status: status as
          | 'draft'
          | 'generating'
          | 'outline_generating'
          | 'slides_generating'
          | 'ready'
          | 'error',
        updatedAt: new Date()
      })
      .where(eq(presentations.id, id))
  } catch (error) {
    if (!canUseDevDbFallback(error)) throw error
  }
  revalidatePresentationsPaths(id)
}

export async function setPresentationPublicShare(formData: FormData) {
  await assertAdminAccess()
  const id = String(formData.get('id') ?? '').trim()
  const enabled = formData.get('enabled') === 'true'
  if (!id) throw new Error('Presentation id is required')

  try {
    await db
      .update(presentations)
      .set({ isPublic: enabled, updatedAt: new Date() })
      .where(eq(presentations.id, id))
  } catch (error) {
    if (!canUseDevDbFallback(error)) throw error
  }
  revalidatePresentationsPaths(id)
}

export async function deletePresentationDeck(formData: FormData) {
  await assertAdminAccess()
  const id = String(formData.get('id') ?? '').trim()
  if (!id) throw new Error('Presentation id is required')

  try {
    await db
      .update(presentations)
      .set({
        status: 'error' as
          | 'draft'
          | 'generating'
          | 'outline_generating'
          | 'slides_generating'
          | 'ready'
          | 'error',
        updatedAt: new Date()
      })
      .where(eq(presentations.id, id))
  } catch (error) {
    if (!canUseDevDbFallback(error)) throw error
  }
  revalidatePresentationsPaths(id)
}

export async function revokePresentationShare(formData: FormData) {
  await assertAdminAccess()
  const id = String(formData.get('id') ?? '').trim()
  if (!id) throw new Error('Share id is required')

  let presentationId: string | null = null

  try {
    const [share] = await db
      .select({ presentationId: presentationShares.presentationId })
      .from(presentationShares)
      .where(eq(presentationShares.id, id))
      .limit(1)
    presentationId = share?.presentationId ?? null

    await db
      .update(presentationShares)
      .set({ status: 'revoked', revokedAt: new Date() })
      .where(eq(presentationShares.id, id))

    if (presentationId) {
      await db
        .update(presentations)
        .set({ isPublic: false, updatedAt: new Date() })
        .where(eq(presentations.id, presentationId))
    }
  } catch (error) {
    if (!canUseDevDbFallback(error)) throw error
  }
  revalidatePresentationsPaths(presentationId ?? undefined)
}

export type AdminPresentationOutline = {
  presentationId: string
  status: string | null
  outlineJson: unknown
  updatedAt: Date | null
}

export async function getPresentationOutlineForAdmin(
  presentationId: string
): Promise<AdminPresentationOutline | null> {
  await assertAdminAccess()
  try {
    const [row] = await db
      .select({
        presentationId: presentationOutlines.presentationId,
        status: presentationOutlines.status,
        outlineJson: presentationOutlines.outlineJson,
        updatedAt: presentationOutlines.updatedAt
      })
      .from(presentationOutlines)
      .where(eq(presentationOutlines.presentationId, presentationId))
      .limit(1)

    if (!row) return null
    return {
      presentationId: row.presentationId,
      status: row.status,
      outlineJson: row.outlineJson,
      updatedAt: row.updatedAt ? asDate(row.updatedAt) : null
    }
  } catch (error) {
    if (canUseDevDbFallback(error)) return null
    throw error
  }
}
