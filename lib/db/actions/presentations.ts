'use server'

import { and, desc, eq, notInArray, sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import { localPresentationStore } from '@/lib/presentations/local-store'
import {
  type Presentation,
  type PresentationExport,
  presentationExports,
  type PresentationGeneration,
  presentationGenerations,
  type PresentationOutline,
  presentationOutlines,
  presentations,
  type PresentationSlide,
  presentationSlides
} from '@/lib/presentations/schema'

let presentationDatabaseUnavailable =
  process.env.PRESENTATIONS_LOCAL_STORE === '1'

function shouldUseLocalPresentationStore() {
  return presentationDatabaseUnavailable
}

function fallbackToLocalPresentationStore<T>(
  error: unknown,
  fallback: () => Promise<T>
) {
  presentationDatabaseUnavailable = true
  const message = error instanceof Error ? error.message : String(error)
  console.warn(
    `[presentations] Database unavailable, using local store fallback: ${message}`
  )
  return fallback()
}

// ============================================================================
// Presentation CRUD
// ============================================================================

export async function createPresentation({
  title,
  userId,
  description,
  language = 'en',
  style,
  slideCount = 0,
  themeId
}: {
  title: string
  userId: string
  description?: string
  language?: string
  style?: string
  slideCount?: number
  themeId?: string
}): Promise<Presentation> {
  if (shouldUseLocalPresentationStore()) {
    return localPresentationStore.createPresentation({
      title,
      userId,
      description,
      language,
      style,
      slideCount,
      themeId
    })
  }

  try {
    const [presentation] = await db
      .insert(presentations)
      .values({
        title,
        userId,
        description,
        language,
        style,
        slideCount,
        themeId,
        status: 'draft'
      })
      .returning()

    return presentation
  } catch (error) {
    return fallbackToLocalPresentationStore(error, () =>
      localPresentationStore.createPresentation({
        title,
        userId,
        description,
        language,
        style,
        slideCount,
        themeId
      })
    )
  }
}

export async function getPresentation(
  id: string,
  userId?: string
): Promise<Presentation | null> {
  if (shouldUseLocalPresentationStore()) {
    return localPresentationStore.getPresentation(id, userId)
  }

  try {
    const [presentation] = userId
      ? await db
          .select()
          .from(presentations)
          .where(eq(presentations.id, id))
          .limit(1)
      : await db
          .select()
          .from(presentations)
          .where(
            and(eq(presentations.id, id), eq(presentations.isPublic, true))
          )
          .limit(1)

    if (!presentation) {
      return null
    }

    // If userId provided, verify ownership
    if (userId && presentation.userId !== userId) {
      return null
    }

    return presentation
  } catch (error) {
    return fallbackToLocalPresentationStore(error, () =>
      localPresentationStore.getPresentation(id, userId)
    )
  }
}

export async function getPresentationWithSlides(
  id: string,
  userId?: string
): Promise<(Presentation & { slides: PresentationSlide[] }) | null> {
  if (shouldUseLocalPresentationStore()) {
    return localPresentationStore.getPresentationWithSlides(id, userId)
  }

  try {
    const presentation = await getPresentation(id, userId)
    if (!presentation) {
      return null
    }

    const slides = await db
      .select()
      .from(presentationSlides)
      .where(eq(presentationSlides.presentationId, id))
      .orderBy(presentationSlides.slideIndex)

    return { ...presentation, slides }
  } catch (error) {
    return fallbackToLocalPresentationStore(error, () =>
      localPresentationStore.getPresentationWithSlides(id, userId)
    )
  }
}

export async function getPresentationsByUser(
  userId: string,
  limit = 20,
  offset = 0
): Promise<{ presentations: Presentation[]; nextOffset: number | null }> {
  if (shouldUseLocalPresentationStore()) {
    return localPresentationStore.getPresentationsByUser(userId, limit, offset)
  }

  try {
    const results = await db
      .select()
      .from(presentations)
      .where(eq(presentations.userId, userId))
      .orderBy(desc(presentations.createdAt))
      .limit(limit)
      .offset(offset)

    const nextOffset = results.length === limit ? offset + limit : null
    return { presentations: results, nextOffset }
  } catch (error) {
    return fallbackToLocalPresentationStore(error, () =>
      localPresentationStore.getPresentationsByUser(userId, limit, offset)
    )
  }
}

export async function updatePresentation(
  id: string,
  userId: string,
  updates: {
    title?: string
    description?: string
    themeId?: string
    slideCount?: number
    status?: Presentation['status']
  }
): Promise<Presentation | null> {
  if (shouldUseLocalPresentationStore()) {
    return localPresentationStore.updatePresentation(id, userId, updates)
  }

  try {
    const presentation = await getPresentation(id, userId)
    if (!presentation) {
      return null
    }

    const [updated] = await db
      .update(presentations)
      .set({
        ...updates,
        updatedAt: new Date()
      })
      .where(eq(presentations.id, id))
      .returning()

    return updated
  } catch (error) {
    return fallbackToLocalPresentationStore(error, () =>
      localPresentationStore.updatePresentation(id, userId, updates)
    )
  }
}

export async function deletePresentation(
  id: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  if (shouldUseLocalPresentationStore()) {
    return localPresentationStore.deletePresentation(id, userId)
  }

  try {
    const presentation = await getPresentation(id, userId)
    if (!presentation) {
      return { success: false, error: 'Presentation not found' }
    }

    // Delete presentation (cascades to slides, outlines, assets, generations, exports)
    await db.delete(presentations).where(eq(presentations.id, id))

    return { success: true }
  } catch (error) {
    console.error('Error deleting presentation:', error)
    return fallbackToLocalPresentationStore(error, () =>
      localPresentationStore.deletePresentation(id, userId)
    )
  }
}

// ============================================================================
// Presentation Outline
// ============================================================================

export async function createOrUpdateOutline({
  presentationId,
  outlineJson,
  status = 'ready'
}: {
  presentationId: string
  outlineJson: Array<{ title: string; bullets: string[] }>
  status?: 'generating' | 'ready' | 'error'
}): Promise<PresentationOutline> {
  if (shouldUseLocalPresentationStore()) {
    return localPresentationStore.createOrUpdateOutline({
      presentationId,
      outlineJson,
      status
    })
  }

  try {
    // Check if outline exists
    const [existing] = await db
      .select()
      .from(presentationOutlines)
      .where(eq(presentationOutlines.presentationId, presentationId))
      .limit(1)

    if (existing) {
      const [updated] = await db
        .update(presentationOutlines)
        .set({
          outlineJson,
          status,
          updatedAt: new Date()
        })
        .where(eq(presentationOutlines.presentationId, presentationId))
        .returning()
      return updated
    }

    const [outline] = await db
      .insert(presentationOutlines)
      .values({
        presentationId,
        outlineJson,
        status
      })
      .returning()

    return outline
  } catch (error) {
    return fallbackToLocalPresentationStore(error, () =>
      localPresentationStore.createOrUpdateOutline({
        presentationId,
        outlineJson,
        status
      })
    )
  }
}

export async function getOutline(
  presentationId: string
): Promise<PresentationOutline | null> {
  if (shouldUseLocalPresentationStore()) {
    return localPresentationStore.getOutline(presentationId)
  }

  try {
    const [outline] = await db
      .select()
      .from(presentationOutlines)
      .where(eq(presentationOutlines.presentationId, presentationId))
      .limit(1)

    return outline || null
  } catch (error) {
    return fallbackToLocalPresentationStore(error, () =>
      localPresentationStore.getOutline(presentationId)
    )
  }
}

export async function updateOutlineStatus(
  presentationId: string,
  status: 'generating' | 'ready' | 'error'
): Promise<void> {
  if (shouldUseLocalPresentationStore()) {
    await localPresentationStore.updateOutlineStatus(presentationId, status)
    return
  }

  try {
    await db
      .update(presentationOutlines)
      .set({ status, updatedAt: new Date() })
      .where(eq(presentationOutlines.presentationId, presentationId))
  } catch (error) {
    await fallbackToLocalPresentationStore(error, () =>
      localPresentationStore.updateOutlineStatus(presentationId, status)
    )
  }
}

// ============================================================================
// Presentation Slides
// ============================================================================

export async function createSlides({
  presentationId,
  slides
}: {
  presentationId: string
  slides: Array<{
    slideIndex: number
    title: string
    layoutType: string
    contentJson: Record<string, any>
    speakerNotes?: string
  }>
}): Promise<PresentationSlide[]> {
  if (shouldUseLocalPresentationStore()) {
    return localPresentationStore.createSlides({ presentationId, slides })
  }

  try {
    return db.transaction(async tx => {
      const slideIndexes = slides.map(slide => slide.slideIndex)

      const createdSlides =
        slides.length > 0
          ? await tx
              .insert(presentationSlides)
              .values(
                slides.map(slide => ({
                  presentationId,
                  slideIndex: slide.slideIndex,
                  title: slide.title,
                  layoutType: slide.layoutType,
                  contentJson: slide.contentJson,
                  speakerNotes: slide.speakerNotes
                }))
              )
              .onConflictDoUpdate({
                target: [
                  presentationSlides.presentationId,
                  presentationSlides.slideIndex
                ],
                set: {
                  title: sql.raw('excluded.title'),
                  layoutType: sql.raw('excluded.layout_type'),
                  contentJson: sql.raw('excluded.content_json'),
                  speakerNotes: sql.raw('excluded.speaker_notes'),
                  updatedAt: new Date()
                }
              })
              .returning()
          : []

      if (slideIndexes.length > 0) {
        await tx
          .delete(presentationSlides)
          .where(
            and(
              eq(presentationSlides.presentationId, presentationId),
              notInArray(presentationSlides.slideIndex, slideIndexes)
            )
          )
      } else {
        await tx
          .delete(presentationSlides)
          .where(eq(presentationSlides.presentationId, presentationId))
      }

      await tx
        .update(presentations)
        .set({
          slideCount: slides.length,
          status: 'ready',
          updatedAt: new Date()
        })
        .where(eq(presentations.id, presentationId))

      return createdSlides
    })
  } catch (error) {
    return fallbackToLocalPresentationStore(error, () =>
      localPresentationStore.createSlides({ presentationId, slides })
    )
  }
}

export async function getSlides(
  presentationId: string
): Promise<PresentationSlide[]> {
  if (shouldUseLocalPresentationStore()) {
    return localPresentationStore.getSlides(presentationId)
  }

  try {
    return db
      .select()
      .from(presentationSlides)
      .where(eq(presentationSlides.presentationId, presentationId))
      .orderBy(presentationSlides.slideIndex)
  } catch (error) {
    return fallbackToLocalPresentationStore(error, () =>
      localPresentationStore.getSlides(presentationId)
    )
  }
}

export async function updateSlide(
  id: string,
  userId: string,
  updates: {
    title?: string
    layoutType?: string
    contentJson?: Record<string, any>
    speakerNotes?: string
  }
): Promise<PresentationSlide | null> {
  if (shouldUseLocalPresentationStore()) {
    return localPresentationStore.updateSlide(id, userId, updates)
  }

  try {
    // First verify ownership via presentation
    const presentation = await db
      .select()
      .from(presentations)
      .innerJoin(
        presentationSlides,
        eq(presentationSlides.presentationId, presentations.id)
      )
      .where(
        and(eq(presentationSlides.id, id), eq(presentations.userId, userId))
      )
      .limit(1)

    if (presentation.length === 0) {
      return null
    }

    const [slide] = await db
      .update(presentationSlides)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(presentationSlides.id, id))
      .returning()

    return slide || null
  } catch (error) {
    return fallbackToLocalPresentationStore(error, () =>
      localPresentationStore.updateSlide(id, userId, updates)
    )
  }
}

export async function updateSlides(
  presentationId: string,
  updates: Array<{
    id: string
    title?: string
    layoutType?: string
    contentJson?: Record<string, any>
    speakerNotes?: string
  }>
): Promise<PresentationSlide[]> {
  if (shouldUseLocalPresentationStore()) {
    return localPresentationStore.updateSlides(presentationId, updates)
  }

  try {
    const updatedSlides: PresentationSlide[] = []

    for (const update of updates) {
      const [slide] = await db
        .update(presentationSlides)
        .set({
          title: update.title,
          layoutType: update.layoutType,
          contentJson: update.contentJson,
          speakerNotes: update.speakerNotes,
          updatedAt: new Date()
        })
        .where(eq(presentationSlides.id, update.id))
        .returning()

      if (slide) {
        updatedSlides.push(slide)
      }
    }

    return updatedSlides
  } catch (error) {
    return fallbackToLocalPresentationStore(error, () =>
      localPresentationStore.updateSlides(presentationId, updates)
    )
  }
}

// ============================================================================
// Presentation Generation
// ============================================================================

export async function createGeneration({
  presentationId,
  userId,
  prompt,
  generationType,
  model,
  webSearchEnabled
}: {
  presentationId: string
  userId: string
  prompt: string
  generationType: 'outline' | 'slides' | 'edit'
  model: string
  webSearchEnabled?: boolean
}): Promise<PresentationGeneration> {
  if (shouldUseLocalPresentationStore()) {
    return localPresentationStore.createGeneration({
      presentationId,
      userId,
      prompt,
      generationType,
      model,
      webSearchEnabled
    })
  }

  try {
    const [generation] = await db
      .insert(presentationGenerations)
      .values({
        presentationId,
        userId,
        prompt,
        generationType,
        model,
        webSearchEnabled: webSearchEnabled ?? false,
        status: 'started'
      })
      .returning()

    return generation
  } catch (error) {
    return fallbackToLocalPresentationStore(error, () =>
      localPresentationStore.createGeneration({
        presentationId,
        userId,
        prompt,
        generationType,
        model,
        webSearchEnabled
      })
    )
  }
}

export async function updateGenerationStatus(
  id: string,
  status: 'started' | 'completed' | 'failed',
  tokens?: { inputTokens?: number; outputTokens?: number; costUsd?: number }
): Promise<void> {
  if (shouldUseLocalPresentationStore()) {
    await localPresentationStore.updateGenerationStatus(id, status, tokens)
    return
  }

  try {
    await db
      .update(presentationGenerations)
      .set({
        status,
        inputTokens: tokens?.inputTokens,
        outputTokens: tokens?.outputTokens,
        costUsd: tokens?.costUsd
      })
      .where(eq(presentationGenerations.id, id))
  } catch (error) {
    await fallbackToLocalPresentationStore(error, () =>
      localPresentationStore.updateGenerationStatus(id, status, tokens)
    )
  }
}

// ============================================================================
// Presentation Export
// ============================================================================

export async function createExport({
  presentationId,
  exportType
}: {
  presentationId: string
  exportType: 'pptx' | 'pdf' | 'images'
}): Promise<PresentationExport> {
  if (shouldUseLocalPresentationStore()) {
    return localPresentationStore.createExport({ presentationId, exportType })
  }

  try {
    const [exportRecord] = await db
      .insert(presentationExports)
      .values({
        presentationId,
        exportType,
        status: 'pending'
      })
      .returning()

    return exportRecord
  } catch (error) {
    return fallbackToLocalPresentationStore(error, () =>
      localPresentationStore.createExport({ presentationId, exportType })
    )
  }
}

export async function updateExportStatus(
  id: string,
  status: 'pending' | 'processing' | 'completed' | 'failed',
  fileUrl?: string
): Promise<void> {
  if (shouldUseLocalPresentationStore()) {
    await localPresentationStore.updateExportStatus(id, status, fileUrl)
    return
  }

  try {
    await db
      .update(presentationExports)
      .set({
        status,
        fileUrl
      })
      .where(eq(presentationExports.id, id))
  } catch (error) {
    await fallbackToLocalPresentationStore(error, () =>
      localPresentationStore.updateExportStatus(id, status, fileUrl)
    )
  }
}

export async function getExport(
  id: string
): Promise<PresentationExport | null> {
  if (shouldUseLocalPresentationStore()) {
    return localPresentationStore.getExport(id)
  }

  try {
    const [exportRecord] = await db
      .select()
      .from(presentationExports)
      .where(eq(presentationExports.id, id))
      .limit(1)

    return exportRecord || null
  } catch (error) {
    return fallbackToLocalPresentationStore(error, () =>
      localPresentationStore.getExport(id)
    )
  }
}

// ============================================================================
// Presentation Share
// ============================================================================

export async function setPresentationShare(
  id: string,
  userId: string,
  isPublic: boolean,
  password?: string
): Promise<{ shareId: string; shareUrl: string } | null> {
  if (shouldUseLocalPresentationStore()) {
    return localPresentationStore.setPresentationShare(id, userId, isPublic)
  }

  try {
    const presentation = await getPresentation(id, userId)
    if (!presentation) {
      return null
    }

    // Generate share_id if making public and none exists
    let shareId = presentation.shareId
    if (isPublic && !shareId) {
      // Generate a unique share ID (using cuid2-like pattern)
      shareId = `shr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    }

    await db
      .update(presentations)
      .set({
        isPublic,
        shareId,
        updatedAt: new Date()
      })
      .where(eq(presentations.id, id))

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    return {
      shareId: shareId!,
      shareUrl: `${baseUrl}/presentations/${id}/present`
    }
  } catch (error) {
    return fallbackToLocalPresentationStore(error, () =>
      localPresentationStore.setPresentationShare(id, userId, isPublic)
    )
  }
}

export async function getPresentationByShareId(
  shareId: string
): Promise<Presentation | null> {
  if (shouldUseLocalPresentationStore()) {
    return localPresentationStore.getPresentationByShareId(shareId)
  }

  try {
    const [presentation] = await db
      .select()
      .from(presentations)
      .where(eq(presentations.shareId, shareId))
      .limit(1)

    return presentation || null
  } catch (error) {
    return fallbackToLocalPresentationStore(error, () =>
      localPresentationStore.getPresentationByShareId(shareId)
    )
  }
}

// ============================================================================
// Update Presentation Status
// ============================================================================

export async function updatePresentationStatus(
  id: string,
  status: Presentation['status']
): Promise<void> {
  if (shouldUseLocalPresentationStore()) {
    await localPresentationStore.updatePresentationStatus(id, status)
    return
  }

  try {
    await db
      .update(presentations)
      .set({
        status,
        updatedAt: new Date()
      })
      .where(eq(presentations.id, id))
  } catch (error) {
    await fallbackToLocalPresentationStore(error, () =>
      localPresentationStore.updatePresentationStatus(id, status)
    )
  }
}
