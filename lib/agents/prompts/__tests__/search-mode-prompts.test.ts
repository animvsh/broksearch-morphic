import { describe, expect, test } from 'vitest'

import { getFastChatPrompt, getQuickModePrompt } from '../search-mode-prompts'

describe('search mode prompts', () => {
  test('fast chat prompt includes related questions for substantive quick answers', () => {
    const prompt = getFastChatPrompt()

    expect(prompt).toContain('RELATED QUESTIONS (MANDATORY)')
    expect(prompt).toContain('title":"Related"')
    expect(prompt).toContain('submitQuery')
    expect(prompt).toContain('skip the spec block entirely')
  })

  test('fast chat prompt requires citations for search-backed answers', () => {
    const prompt = getFastChatPrompt()

    expect(prompt).toContain('every factual sentence')
    expect(prompt).toContain('[number](#toolCallId)')
    expect(prompt).toContain('Use only toolCallIds from searches executed')
  })

  test('search prompt keeps the mandatory related questions contract', () => {
    const prompt = getQuickModePrompt()

    expect(prompt).toContain('RELATED QUESTIONS (MANDATORY)')
    expect(prompt).toContain('exactly 3 follow-up questions')
    expect(prompt).not.toContain('skip the spec block entirely')
  })
})
