import { describe, expect, it } from 'vitest'

import {
  getLatestUserMessage,
  getSimpleUtilityReplyForMessage,
  hasUploadedFileContext,
  isSimpleUtilityText,
  shouldForceInitialWebSearchForMessage,
  shouldForceSearchForText,
  shouldUseQuickReplyForMessage
} from '../chat-routing'

describe('chat routing', () => {
  it('routes tiny utility messages to quick replies', () => {
    expect(isSimpleUtilityText('test')).toBe(true)
    expect(isSimpleUtilityText('test internet speed providers')).toBe(false)

    expect(
      shouldUseQuickReplyForMessage({
        role: 'user',
        parts: [{ type: 'text', text: 'test' }]
      })
    ).toBe(true)

    expect(
      shouldUseQuickReplyForMessage({
        role: 'user',
        parts: [{ type: 'text', text: 'can u see this' }]
      })
    ).toBe(true)
  })

  it('creates deterministic short replies for utility checks', () => {
    expect(
      getSimpleUtilityReplyForMessage({
        role: 'user',
        parts: [{ type: 'text', text: 'test' }]
      })
    ).toBe('Yep, it works.')

    expect(
      getSimpleUtilityReplyForMessage({
        role: 'user',
        parts: [{ type: 'text', text: 'can you see this?' }]
      })
    ).toBe('Yep, I can see this.')
  })

  it('keeps real research prompts in their selected mode', () => {
    expect(
      shouldUseQuickReplyForMessage({
        role: 'user',
        parts: [{ type: 'text', text: 'test internet speed providers' }]
      })
    ).toBe(false)

    expect(
      shouldUseQuickReplyForMessage({
        role: 'user',
        parts: [{ type: 'text', text: 'https://example.com' }]
      })
    ).toBe(false)
  })

  it('detects prompts that should force an initial web search', () => {
    expect(shouldForceSearchForText('who is animesh alang')).toBe(true)
    expect(shouldForceSearchForText('search recent funding news')).toBe(true)
    expect(shouldForceSearchForText('https://example.com')).toBe(true)
    expect(
      shouldForceSearchForText('where else has his name been mentioned')
    ).toBe(true)
    expect(shouldForceSearchForText('should i invest in this founder')).toBe(
      true
    )
    expect(shouldForceSearchForText('how does Capy work?')).toBe(true)
    expect(shouldForceSearchForText('why is Founders Inc notable')).toBe(true)
    expect(shouldForceSearchForText('test')).toBe(false)
    expect(shouldForceSearchForText('help me rewrite this paragraph')).toBe(
      false
    )
  })

  it('does not downgrade uploaded-file questions', () => {
    expect(
      shouldUseQuickReplyForMessage({
        role: 'user',
        parts: [
          {
            type: 'text',
            text: '<uploaded_file name="notes.pdf">hello</uploaded_file>'
          }
        ]
      })
    ).toBe(false)

    const message = {
      role: 'user' as const,
      parts: [
        { type: 'text' as const, text: 'what is this' },
        {
          type: 'text' as const,
          text: '<uploaded_file name="notes.pdf">private file text</uploaded_file>'
        }
      ]
    }

    expect(hasUploadedFileContext(message)).toBe(true)
    expect(shouldForceInitialWebSearchForMessage(message)).toBe(false)
    expect(
      shouldForceInitialWebSearchForMessage({
        role: 'user',
        parts: [{ type: 'text', text: 'who is animesh alang' }]
      })
    ).toBe(true)
  })

  it('finds the newest user message', () => {
    expect(
      getLatestUserMessage([
        { role: 'user', parts: [{ type: 'text', text: 'old' }] },
        { role: 'assistant', parts: [{ type: 'text', text: 'answer' }] },
        { role: 'user', parts: [{ type: 'text', text: 'new' }] }
      ] as any[])?.parts[0]
    ).toMatchObject({ text: 'new' })
  })
})
