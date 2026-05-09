import { NextResponse } from 'next/server'

import { getCurrentUserId } from '@/lib/auth/get-current-user'
import {
  createExport,
  getExport,
  getPresentationWithSlides,
  updateExportStatus
} from '@/lib/db/actions/presentations'

/**
 * POST /api/presentations/:id/export
 * Export presentation to PPTX/PDF/images
 *
 * Note: pptxgenjs needs to be installed for PPTX export:
 * bun add pptxgenjs
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

    const body = await req.json()
    const { format } = body

    if (!format || !['pptx', 'pdf', 'images'].includes(format)) {
      return NextResponse.json(
        { error: 'format must be one of: pptx, pdf, images' },
        { status: 400 }
      )
    }

    // Create export record
    const exportRecord = await createExport({
      presentationId: id,
      exportType: format
    })

    // Mark as processing
    await updateExportStatus(exportRecord.id, 'processing')

    // TODO: Implement actual export logic using pptxgenjs
    // For now, return a placeholder response
    //
    // Example pptxgenjs implementation:
    // const pptxgen = require('pptxgenjs')
    // const pres = new pptxgen()
    //
    // for (const slide of presentation.slides) {
    //   const pptSlide = pres.addSlide()
    //   pptSlide.addText(slide.title, { fontSize: 24, bold: true })
    //   if (slide.contentJson.bullets) {
    //     slide.contentJson.bullets.forEach((bullet: string, idx: number) => {
    //       pptSlide.addText(bullet, { bullet: true, breakLine: idx < slide.contentJson.bullets.length - 1 })
    //     })
    //   }
    // }
    //
    // const buffer = await pres.writeBuffer()
    // Upload to S3 and get URL...

    // For demo purposes, return a placeholder URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const placeholderUrl = `${baseUrl}/exports/${exportRecord.id}.${format === 'images' ? 'zip' : format}`

    await updateExportStatus(exportRecord.id, 'completed', placeholderUrl)

    return NextResponse.json({
      file_url: placeholderUrl,
      status: 'completed',
      export_id: exportRecord.id
    })
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
