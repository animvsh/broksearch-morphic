import { describe, expect, it } from 'vitest'

import { normalizeBrokMessages } from '../provider-router'

describe('normalizeBrokMessages', () => {
  it('folds system instructions into the first user message', () => {
    const messages = normalizeBrokMessages([
      { role: 'system', content: 'Be concise.' },
      { role: 'user', content: 'Build a todo app.' },
      { role: 'assistant', content: 'Sure.' }
    ])

    expect(messages).toEqual([
      {
        role: 'user',
        content:
          'System instructions:\nBe concise.\n\nUser request:\nBuild a todo app.'
      },
      { role: 'assistant', content: 'Sure.' }
    ])
  })

  it('creates a user message when only system instructions are present', () => {
    expect(
      normalizeBrokMessages([{ role: 'system', content: 'No markdown.' }])
    ).toEqual([{ role: 'user', content: 'System instructions:\nNo markdown.' }])
  })

  it('folds OpenAI developer instructions into the first user message', () => {
    const messages = normalizeBrokMessages([
      { role: 'developer', content: 'Prefer terse answers.' },
      { role: 'user', content: 'Explain Brok.' }
    ])

    expect(messages).toEqual([
      {
        role: 'user',
        content:
          'System instructions:\nPrefer terse answers.\n\nUser request:\nExplain Brok.'
      }
    ])
  })
})
