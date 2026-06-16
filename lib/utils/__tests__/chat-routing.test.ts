import { describe, expect, it } from 'vitest'

import {
  getLatestUserMessage,
  getSimpleUtilityReplyForMessage,
  hasUploadedFileContext,
  isSimpleUtilityText,
  shouldForceInitialWebSearchForMessage,
  shouldForceInitialWebSearchForTurn,
  shouldForceSearchForText,
  shouldUseQuickReplyForMessage,
  shouldUseQuickSearchModeForMessage
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

    expect(
      getSimpleUtilityReplyForMessage({
        role: 'user',
        parts: [{ type: 'text', text: 'hi' }]
      })
    ).toBe('Hey, I am here.')
  })

  it('answers tiny lowercase fragments without running a full model turn', () => {
    expect(
      shouldUseQuickReplyForMessage({
        role: 'user',
        parts: [{ type: 'text', text: 'jo' }]
      })
    ).toBe(true)

    expect(
      getSimpleUtilityReplyForMessage({
        role: 'user',
        parts: [{ type: 'text', text: 'jo' }]
      })
    ).toBe('I need a little more to search well. Try a full question or topic.')
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

  it('routes short factual questions to quick search mode', () => {
    const message = {
      role: 'user' as const,
      parts: [{ type: 'text' as const, text: 'who is animesh alang' }]
    }

    expect(shouldUseQuickSearchModeForMessage(message)).toBe(true)
    expect(shouldUseQuickReplyForMessage(message)).toBe(false)
  })

  it('does not route long analytical prompts to quick search', () => {
    expect(
      shouldUseQuickSearchModeForMessage({
        role: 'user',
        parts: [
          {
            type: 'text',
            text: 'analyze the differences between all major AI coding platforms, compare pricing, benchmarks, and long-term risks in a deep framework'
          }
        ]
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

  it('forces search and deep modes to start with web search', () => {
    const conversationalMessage = {
      role: 'user' as const,
      parts: [{ type: 'text' as const, text: 'help me rewrite this paragraph' }]
    }

    expect(
      shouldForceInitialWebSearchForTurn({
        searchMode: 'search',
        message: conversationalMessage
      })
    ).toBe(true)
    expect(
      shouldForceInitialWebSearchForTurn({
        searchMode: 'deep',
        message: conversationalMessage
      })
    ).toBe(true)
    expect(
      shouldForceInitialWebSearchForTurn({
        searchMode: 'code',
        message: conversationalMessage
      })
    ).toBe(false)
  })

  it('forces quick mode search only for factual or search-like prompts', () => {
    expect(
      shouldForceInitialWebSearchForTurn({
        searchMode: 'quick',
        message: {
          role: 'user',
          parts: [{ type: 'text', text: 'what is photosynthesis?' }]
        }
      })
    ).toBe(true)

    expect(
      shouldForceInitialWebSearchForTurn({
        searchMode: 'quick',
        message: {
          role: 'user',
          parts: [{ type: 'text', text: 'help me rewrite this paragraph' }]
        }
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
