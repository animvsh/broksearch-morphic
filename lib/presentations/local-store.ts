import { randomUUID } from 'crypto'
import { mkdir, readFile, writeFile } from 'fs/promises'
import path from 'path'

import type {
  Presentation,
  PresentationExport,
  PresentationGeneration,
  PresentationOutline,
  PresentationSlide
} from '@/lib/presentations/schema'

type PresentationStatus = Presentation['status']
type OutlineStatus = PresentationOutline['status']
type GenerationStatus = PresentationGeneration['status']
type ExportStatus = PresentationExport['status']

interface LocalPresentationData {
  presentations: Presentation[]
  outlines: PresentationOutline[]
  slides: PresentationSlide[]
  generations: PresentationGeneration[]
  exports: PresentationExport[]
}

const STORE_DIR = path.join(process.cwd(), '.brokcode')
const STORE_PATH = path.join(STORE_DIR, 'presentation-store.json')

const emptyData = (): LocalPresentationData => ({
  presentations: [],
  outlines: [],
  slides: [],
  generations: [],
  exports: []
})

function dateReviver(key: string, value: unknown) {
  if (
    typeof value === 'string' &&
    ['createdAt', 'updatedAt'].includes(key)
  ) {
    return new Date(value)
  }

  return value
}

async function readStore(): Promise<LocalPresentationData> {
  try {
    const raw = await readFile(STORE_PATH, 'utf8')
    const parsed = JSON.parse(raw, dateReviver) as LocalPresentationData
    return {
      ...emptyData(),
      ...parsed
    }
  } catch {
    return emptyData()
  }
}

async function writeStore(data: LocalPresentationData) {
  await mkdir(STORE_DIR, { recursive: true })
  await writeFile(STORE_PATH, JSON.stringify(data, null, 2))
}

async function updateStore<T>(
  updater: (data: LocalPresentationData) => T | Promise<T>
) {
  const data = await readStore()
  const result = await updater(data)
  await writeStore(data)
  return result
}

function byUpdatedAtDesc(a: Presentation, b: Presentation) {
  return b.updatedAt.getTime() - a.updatedAt.getTime()
}

function now() {
  return new Date()
}

export const localPresentationStore = {
  async createPresentation({
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
    return updateStore(data => {
      const createdAt = now()
      const presentation: Presentation = {
        id: randomUUID(),
        userId,
        workspaceId: null,
        title,
        description: description ?? null,
        status: 'draft',
        themeId: themeId ?? null,
        language,
        style: style ?? null,
        slideCount,
        shareId: null,
        isPublic: false,
        createdAt,
        updatedAt: createdAt
      }

      data.presentations.unshift(presentation)
      return presentation
    })
  },

  async getPresentation(
    id: string,
    userId?: string
  ): Promise<Presentation | null> {
    const data = await readStore()
    const presentation = data.presentations.find(item => item.id === id)
    if (!presentation) return null
    if (userId) return presentation.userId === userId ? presentation : null
    return presentation.isPublic ? presentation : null
  },

  async getPresentationWithSlides(
    id: string,
    userId?: string
  ): Promise<(Presentation & { slides: PresentationSlide[] }) | null> {
    const presentation = await this.getPresentation(id, userId)
    if (!presentation) return null

    const data = await readStore()
    const slides = data.slides
      .filter(slide => slide.presentationId === id)
      .sort((a, b) => a.slideIndex - b.slideIndex)

    return { ...presentation, slides }
  },

  async getPresentationsByUser(userId: string, limit = 20, offset = 0) {
    const data = await readStore()
    const presentations = data.presentations
      .filter(presentation => presentation.userId === userId)
      .sort(byUpdatedAtDesc)
      .slice(offset, offset + limit)

    return {
      presentations,
      nextOffset: presentations.length === limit ? offset + limit : null
    }
  },

  async updatePresentation(
    id: string,
    userId: string,
    updates: {
      title?: string
      description?: string
      themeId?: string
      slideCount?: number
      status?: PresentationStatus
    }
  ): Promise<Presentation | null> {
    return updateStore(data => {
      const index = data.presentations.findIndex(
        presentation =>
          presentation.id === id && presentation.userId === userId
      )
      if (index === -1) return null

      data.presentations[index] = {
        ...data.presentations[index],
        ...updates,
        updatedAt: now()
      }

      return data.presentations[index]
    })
  },

  async deletePresentation(id: string, userId: string) {
    return updateStore(data => {
      const presentation = data.presentations.find(
        item => item.id === id && item.userId === userId
      )

      if (!presentation) {
        return { success: false, error: 'Presentation not found' }
      }

      data.presentations = data.presentations.filter(item => item.id !== id)
      data.outlines = data.outlines.filter(item => item.presentationId !== id)
      data.slides = data.slides.filter(item => item.presentationId !== id)
      data.generations = data.generations.filter(
        item => item.presentationId !== id
      )
      data.exports = data.exports.filter(item => item.presentationId !== id)

      return { success: true }
    })
  },

  async createOrUpdateOutline({
    presentationId,
    outlineJson,
    status = 'ready'
  }: {
    presentationId: string
    outlineJson: Array<{ title: string; bullets: string[] }>
    status?: OutlineStatus
  }): Promise<PresentationOutline> {
    return updateStore(data => {
      const existingIndex = data.outlines.findIndex(
        outline => outline.presentationId === presentationId
      )

      if (existingIndex !== -1) {
        data.outlines[existingIndex] = {
          ...data.outlines[existingIndex],
          outlineJson,
          status,
          updatedAt: now()
        }
        return data.outlines[existingIndex]
      }

      const createdAt = now()
      const outline: PresentationOutline = {
        id: randomUUID(),
        presentationId,
        outlineJson,
        status,
        createdAt,
        updatedAt: createdAt
      }
      data.outlines.push(outline)
      return outline
    })
  },

  async getOutline(presentationId: string): Promise<PresentationOutline | null> {
    const data = await readStore()
    return (
      data.outlines.find(outline => outline.presentationId === presentationId) ??
      null
    )
  },

  async updateOutlineStatus(
    presentationId: string,
    status: OutlineStatus
  ): Promise<void> {
    await updateStore(data => {
      const outline = data.outlines.find(item => item.presentationId === presentationId)
      if (outline) {
        outline.status = status
        outline.updatedAt = now()
      }
    })
  },

  async createSlides({
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
    return updateStore(data => {
      const existingByIndex = new Map(
        data.slides
          .filter(slide => slide.presentationId === presentationId)
          .map(slide => [slide.slideIndex, slide])
      )
      const slideIndexes = new Set(slides.map(slide => slide.slideIndex))
      const timestamp = now()

      const createdSlides = slides.map(slide => {
        const existing = existingByIndex.get(slide.slideIndex)
        return {
          id: existing?.id ?? randomUUID(),
          presentationId,
          slideIndex: slide.slideIndex,
          title: slide.title,
          layoutType: slide.layoutType,
          contentJson: slide.contentJson,
          speakerNotes: slide.speakerNotes ?? null,
          createdAt: existing?.createdAt ?? timestamp,
          updatedAt: timestamp
        } satisfies PresentationSlide
      })

      data.slides = [
        ...data.slides.filter(
          slide =>
            slide.presentationId !== presentationId ||
            !slideIndexes.has(slide.slideIndex)
        ),
        ...createdSlides
      ].filter(
        slide =>
          slide.presentationId !== presentationId ||
          slideIndexes.has(slide.slideIndex)
      )

      const presentation = data.presentations.find(item => item.id === presentationId)
      if (presentation) {
        presentation.slideCount = slides.length
        presentation.status = 'ready'
        presentation.updatedAt = timestamp
      }

      return createdSlides.sort((a, b) => a.slideIndex - b.slideIndex)
    })
  },

  async getSlides(presentationId: string): Promise<PresentationSlide[]> {
    const data = await readStore()
    return data.slides
      .filter(slide => slide.presentationId === presentationId)
      .sort((a, b) => a.slideIndex - b.slideIndex)
  },

  async updateSlide(
    id: string,
    userId: string,
    updates: {
      title?: string
      layoutType?: string
      contentJson?: Record<string, any>
      speakerNotes?: string
    }
  ): Promise<PresentationSlide | null> {
    return updateStore(data => {
      const slideIndex = data.slides.findIndex(slide => slide.id === id)
      if (slideIndex === -1) return null

      const presentation = data.presentations.find(
        item => item.id === data.slides[slideIndex].presentationId
      )
      if (!presentation || presentation.userId !== userId) return null

      data.slides[slideIndex] = {
        ...data.slides[slideIndex],
        ...updates,
        speakerNotes: updates.speakerNotes ?? data.slides[slideIndex].speakerNotes,
        updatedAt: now()
      }
      presentation.updatedAt = now()

      return data.slides[slideIndex]
    })
  },

  async updateSlides(
    presentationId: string,
    updates: Array<{
      id: string
      title?: string
      layoutType?: string
      contentJson?: Record<string, any>
      speakerNotes?: string
    }>
  ): Promise<PresentationSlide[]> {
    return updateStore(data => {
      const updatedSlides: PresentationSlide[] = []
      const timestamp = now()

      for (const update of updates) {
        const index = data.slides.findIndex(
          slide => slide.id === update.id && slide.presentationId === presentationId
        )
        if (index === -1) continue

        data.slides[index] = {
          ...data.slides[index],
          ...update,
          speakerNotes: update.speakerNotes ?? data.slides[index].speakerNotes,
          updatedAt: timestamp
        }
        updatedSlides.push(data.slides[index])
      }

      const presentation = data.presentations.find(item => item.id === presentationId)
      if (presentation) presentation.updatedAt = timestamp

      return updatedSlides
    })
  },

  async createGeneration({
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
    return updateStore(data => {
      const generation: PresentationGeneration = {
        id: randomUUID(),
        presentationId,
        userId,
        prompt,
        generationType,
        model,
        webSearchEnabled: webSearchEnabled ?? false,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        status: 'started',
        createdAt: now()
      }
      data.generations.push(generation)
      return generation
    })
  },

  async updateGenerationStatus(
    id: string,
    status: GenerationStatus,
    tokens?: { inputTokens?: number; outputTokens?: number; costUsd?: number }
  ): Promise<void> {
    await updateStore(data => {
      const generation = data.generations.find(item => item.id === id)
      if (!generation) return
      generation.status = status
      generation.inputTokens = tokens?.inputTokens ?? generation.inputTokens
      generation.outputTokens = tokens?.outputTokens ?? generation.outputTokens
      generation.costUsd = tokens?.costUsd ?? generation.costUsd
    })
  },

  async createExport({
    presentationId,
    exportType
  }: {
    presentationId: string
    exportType: 'pptx' | 'pdf' | 'images'
  }): Promise<PresentationExport> {
    return updateStore(data => {
      const exportRecord: PresentationExport = {
        id: randomUUID(),
        presentationId,
        exportType,
        fileUrl: null,
        status: 'pending',
        createdAt: now()
      }
      data.exports.push(exportRecord)
      return exportRecord
    })
  },

  async updateExportStatus(
    id: string,
    status: ExportStatus,
    fileUrl?: string
  ): Promise<void> {
    await updateStore(data => {
      const exportRecord = data.exports.find(item => item.id === id)
      if (!exportRecord) return
      exportRecord.status = status
      exportRecord.fileUrl = fileUrl ?? exportRecord.fileUrl
    })
  },

  async getExport(id: string): Promise<PresentationExport | null> {
    const data = await readStore()
    return data.exports.find(item => item.id === id) ?? null
  },

  async setPresentationShare(
    id: string,
    userId: string,
    isPublic: boolean
  ): Promise<{ shareId: string; shareUrl: string } | null> {
    return updateStore(data => {
      const presentation = data.presentations.find(
        item => item.id === id && item.userId === userId
      )
      if (!presentation) return null

      presentation.isPublic = isPublic
      if (isPublic && !presentation.shareId) {
        presentation.shareId = `shr_${Date.now().toString(36)}_${Math.random()
          .toString(36)
          .slice(2, 8)}`
      }
      presentation.updatedAt = now()

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'
      return {
        shareId: presentation.shareId!,
        shareUrl: `${baseUrl}/presentations/${id}/present`
      }
    })
  },

  async getPresentationByShareId(
    shareId: string
  ): Promise<Presentation | null> {
    const data = await readStore()
    return (
      data.presentations.find(presentation => presentation.shareId === shareId) ??
      null
    )
  },

  async updatePresentationStatus(
    id: string,
    status: PresentationStatus
  ): Promise<void> {
    await updateStore(data => {
      const presentation = data.presentations.find(item => item.id === id)
      if (!presentation) return
      presentation.status = status
      presentation.updatedAt = now()
    })
  }
}
