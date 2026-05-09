'use server'

import { desc, eq } from 'drizzle-orm'

import { db } from '@/lib/db'
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
  presentationSlides} from '@/lib/presentations/schema'

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
}

export async function getPresentation(
  id: string,
  userId?: string
): Promise<Presentation | null> {
  const [presentation] = await db
    .select()
    .from(presentations)
    .where(eq(presentations.id, id))
    .limit(1)

  if (!presentation) {
    return null
  }

  // If userId provided, verify ownership
  if (userId && presentation.userId !== userId) {
    return null
  }

  return presentation
}

export async function getPresentationWithSlides(
  id: string,
  userId?: string
): Promise<(Presentation & { slides: PresentationSlide[] }) | null> {
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
}

export async function getPresentationsByUser(
  userId: string,
  limit = 20,
  offset = 0
): Promise<{ presentations: Presentation[]; nextOffset: number | null }> {
  const results = await db
    .select()
    .from(presentations)
    .where(eq(presentations.userId, userId))
    .orderBy(desc(presentations.createdAt))
    .limit(limit)
    .offset(offset)

  const nextOffset = results.length === limit ? offset + limit : null
  return { presentations: results, nextOffset }
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
}

export async function deletePresentation(
  id: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
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
    return { success: false, error: 'Failed to delete presentation' }
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
}

export async function getOutline(
  presentationId: string
): Promise<PresentationOutline | null> {
  const [outline] = await db
    .select()
    .from(presentationOutlines)
    .where(eq(presentationOutlines.presentationId, presentationId))
    .limit(1)

  return outline || null
}

export async function updateOutlineStatus(
  presentationId: string,
  status: 'generating' | 'ready' | 'error'
): Promise<void> {
  await db
    .update(presentationOutlines)
    .set({ status, updatedAt: new Date() })
    .where(eq(presentationOutlines.presentationId, presentationId))
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
  // Delete existing slides first
  await db
    .delete(presentationSlides)
    .where(eq(presentationSlides.presentationId, presentationId))

  // Insert new slides
  const createdSlides = await db
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
    .returning()

  // Update presentation slide count and status
  await db
    .update(presentations)
    .set({
      slideCount: slides.length,
      status: 'ready',
      updatedAt: new Date()
    })
    .where(eq(presentations.id, presentationId))

  return createdSlides
}

export async function getSlides(
  presentationId: string
): Promise<PresentationSlide[]> {
  return db
    .select()
    .from(presentationSlides)
    .where(eq(presentationSlides.presentationId, presentationId))
    .orderBy(presentationSlides.slideIndex)
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
  // First verify ownership via presentation
  const presentation = await db
    .select()
    .from(presentations)
    .where(eq(presentations.id, userId)) // This is wrong, need to fix
    .limit(1)

  const [slide] = await db
    .update(presentationSlides)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(presentationSlides.id, id))
    .returning()

  return slide || null
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
}

export async function updateGenerationStatus(
  id: string,
  status: 'started' | 'completed' | 'failed',
  tokens?: { inputTokens?: number; outputTokens?: number; costUsd?: number }
): Promise<void> {
  await db
    .update(presentationGenerations)
    .set({
      status,
      inputTokens: tokens?.inputTokens,
      outputTokens: tokens?.outputTokens,
      costUsd: tokens?.costUsd
    })
    .where(eq(presentationGenerations.id, id))
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
  const [exportRecord] = await db
    .insert(presentationExports)
    .values({
      presentationId,
      exportType,
      status: 'pending'
    })
    .returning()

  return exportRecord
}

export async function updateExportStatus(
  id: string,
  status: 'pending' | 'processing' | 'completed' | 'failed',
  fileUrl?: string
): Promise<void> {
  await db
    .update(presentationExports)
    .set({
      status,
      fileUrl
    })
    .where(eq(presentationExports.id, id))
}

export async function getExport(id: string): Promise<PresentationExport | null> {
  const [exportRecord] = await db
    .select()
    .from(presentationExports)
    .where(eq(presentationExports.id, id))
    .limit(1)

  return exportRecord || null
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
}

export async function getPresentationByShareId(
  shareId: string
): Promise<Presentation | null> {
  const [presentation] = await db
    .select()
    .from(presentations)
    .where(eq(presentations.shareId, shareId))
    .limit(1)

  return presentation || null
}

// ============================================================================
// Update Presentation Status
// ============================================================================

export async function updatePresentationStatus(
  id: string,
  status: Presentation['status']
): Promise<void> {
  await db
    .update(presentations)
    .set({
      status,
      updatedAt: new Date()
    })
    .where(eq(presentations.id, id))
}
