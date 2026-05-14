import { describe, expect, it } from 'vitest'

import {
  extractTitleFromMessage,
  getTextFromParts,
  getVisibleTextFromParts,
  stripUploadedFileContext
} from '../message-utils'

describe('message utils uploaded file context', () => {
  const hiddenContext =
    '<uploaded_file name="lab3.pdf">Secret extracted firewall notes</uploaded_file>'

  it('keeps uploaded file context available for model text extraction', () => {
    expect(
      getTextFromParts([
        { type: 'text', text: 'what is this' },
        { type: 'text', text: hiddenContext }
      ] as any)
    ).toContain('Secret extracted firewall notes')
  })

  it('strips uploaded file context for visible UI chrome and titles', () => {
    expect(
      getVisibleTextFromParts([
        { type: 'text', text: 'what is this' },
        { type: 'text', text: hiddenContext }
      ] as any)
    ).toBe('what is this')
  })

  it('strips uploaded file context from raw text', () => {
    expect(stripUploadedFileContext(`Summarize this\n${hiddenContext}`)).toBe(
      'Summarize this'
    )
  })

  it('does not title chats with hidden uploaded file content', () => {
    expect(
      extractTitleFromMessage({
        role: 'user',
        content: hiddenContext
      })
    ).toBe('New Chat')
  })
})
