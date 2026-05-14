import { describe, expect, it } from 'vitest'

import {
  getLatestUserMessage,
  getSimpleUtilityReplyForMessage,
  shouldUseQuickReplyForMessage
} from '../chat-routing'

describe('chat routing', () => {
  it('routes tiny utility messages to quick replies', () => {
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
