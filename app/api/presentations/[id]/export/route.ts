import { NextResponse } from 'next/server'

import { getCurrentUserId } from '@/lib/auth/get-current-user'
import {
  createExport,
  getExport,
  getPresentationWithSlides,
  updateExportStatus
} from '@/lib/db/actions/presentations'
import { exportToPptx } from '@/lib/presentations/export/pptx'
import type { SlideContent } from '@/lib/presentations/theme-utils'
import { getThemeById } from '@/lib/presentations/theme-utils'

/**
 * POST /api/presentations/:id/export
 * Export presentation to PPTX format
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const userId = await getCurrentUserId()

    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const body = await req.json()
    const format = body.format || 'pptx'

    if (format !== 'pptx') {
      return NextResponse.json(
        { error: 'Only PPTX format is currently supported' },
        { status: 400 }
      )
    }

    // Get presentation with slides
    const presentation = await getPresentationWithSlides(id, userId)

    if (!presentation) {
      return NextResponse.json(
        { error: 'Presentation not found' },
        { status: 404 }
      )
    }

    if (!presentation.slides || presentation.slides.length === 0) {
      return NextResponse.json(
        { error: 'No slides to export' },
        { status: 400 }
      )
    }

    // Create export record
    const exportRecord = await createExport({
      presentationId: id,
      exportType: 'pptx'
    })

    // Mark as processing
    await updateExportStatus(exportRecord.id, 'processing')

    try {
      // Get theme
      const theme = getThemeById(presentation.themeId || 'minimal_light')

      if (!theme) {
        throw new Error('Theme not found')
      }

      // Convert slides to SlideContent format
      const slides: SlideContent[] = presentation.slides.map(slide => {
        const content = slide.contentJson as Record<string, unknown>
        const slideContent: SlideContent = {
          id: slide.id,
          layout: slide.layoutType,
          heading: slide.title,
          bullets: content.bullets as string[] | undefined,
          body: content.body as SlideContent['body'],
          imageUrl: content.imageUrl as string | undefined,
          quote: content.quote as string | undefined,
          quoteAttribution: content.quoteAttribution as string | undefined,
          stats: content.stats as SlideContent['stats'],
          speakerNotes: slide.speakerNotes || undefined
        }
        return slideContent
      })

      // Generate PPTX
      const pptxBuffer = await exportToPptx({
        title: presentation.title,
        slides,
        theme
      })

      // Mark export as completed
      await updateExportStatus(exportRecord.id, 'completed')

      // Return the buffer as a downloadable file
      // Convert Buffer to Uint8Array for proper ReadableStream handling
      const uint8Array = new Uint8Array(pptxBuffer.buffer, pptxBuffer.byteOffset, pptxBuffer.byteLength)
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(uint8Array)
          controller.close()
        }
      })
      return new Response(stream, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'Content-Disposition': `attachment; filename="${presentation.title.replace(/[^a-z0-9]/gi, '_')}.pptx"`
        }
      })
    } catch (exportError) {
      console.error('Error generating PPTX:', exportError)
      await updateExportStatus(exportRecord.id, 'failed')
      return NextResponse.json(
        { error: 'Failed to generate PPTX' },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Error exporting presentation:', error)
    return NextResponse.json(
      { error: 'Failed to export presentation' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/presentations/:id/export
 * Get export status
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(req.url)
    const exportId = searchParams.get('export_id')

    if (!exportId) {
      return NextResponse.json(
        { error: 'export_id is required' },
        { status: 400 }
      )
    }

    const exportRecord = await getExport(exportId)

    if (!exportRecord) {
      return NextResponse.json(
        { error: 'Export not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      export_id: exportRecord.id,
      status: exportRecord.status,
      file_url: exportRecord.fileUrl
    })
  } catch (error) {
    console.error('Error getting export status:', error)
    return NextResponse.json(
      { error: 'Failed to get export status' },
      { status: 500 }
    )
  }
}
