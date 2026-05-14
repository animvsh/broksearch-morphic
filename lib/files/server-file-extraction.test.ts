// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { extractUploadedFileText } from './server-file-extraction'

describe('extractUploadedFileText', () => {
  it('extracts readable text from uploaded PDFs', async () => {
    const file = new File(['%PDF fixture'], 'fixture.pdf', {
      type: 'application/pdf'
    })

    const result = await extractUploadedFileText(file, async buffer => {
      expect(Buffer.isBuffer(buffer)).toBe(true)
      return {
        text: 'Brok upload fixture. Quarterly revenue was 12345 dollars.',
        numpages: 1
      }
    })

    expect(result.status).toBe('extracted')
    expect(result.text).toContain('Quarterly revenue was 12345 dollars')
    expect(result.pageCount).toBe(1)
  })

  it('extracts readable text from text and markdown uploads', async () => {
    const file = new File(
      ['# Notes\n\nThe onboarding checklist has 7 blockers.'],
      'notes.md',
      {
        type: 'text/markdown'
      }
    )

    const result = await extractUploadedFileText(file)

    expect(result.status).toBe('extracted')
    expect(result.text).toContain('onboarding checklist has 7 blockers')
    expect(result.charCount).toBeGreaterThan(20)
  })

  it('extracts readable text from code uploads by extension even without a MIME type', async () => {
    const file = new File(['export const apiStatus = "working"'], 'status.ts', {
      type: ''
    })

    const result = await extractUploadedFileText(file)

    expect(result.status).toBe('extracted')
    expect(result.text).toContain('apiStatus')
  })

  it('skips non-document attachments', async () => {
    const file = new File(['not an image'], 'fixture.png', {
      type: 'image/png'
    })

    await expect(extractUploadedFileText(file)).resolves.toMatchObject({
      status: 'skipped',
      charCount: 0
    })
  })
})
