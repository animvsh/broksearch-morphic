import { describe, expect, it } from 'vitest'

import {
  classifyBrokIntent,
  resolveSearchModeForIntent
} from '../intent-router'

function userMessage(text: string) {
  return {
    role: 'user' as const,
    parts: [{ type: 'text' as const, text }]
  }
}

describe('classifyBrokIntent', () => {
  it('classifies utility checks', () => {
    expect(classifyBrokIntent(userMessage('test'))).toMatchObject({
      intent: 'utility'
    })
  })

  it('classifies factual questions as quick search', () => {
    expect(
      classifyBrokIntent(userMessage('who is animesh alang'))
    ).toMatchObject({
      intent: 'quick_search'
    })
  })

  it('classifies comparisons as standard search', () => {
    expect(
      classifyBrokIntent(userMessage('compare Perplexity and Brok for search'))
    ).toMatchObject({
      intent: 'standard_search'
    })
  })

  it('classifies explicit deep research prompts', () => {
    expect(
      classifyBrokIntent(
        userMessage('do deep research on AI email clients with citations')
      )
    ).toMatchObject({
      intent: 'deep_research'
    })
  })

  it('classifies Google Slides deck creation as a connector action', () => {
    expect(
      classifyBrokIntent(
        userMessage('make a Google Slides deck about AI email clients')
      )
    ).toMatchObject({
      intent: 'connector_action',
      connector: {
        toolkit: 'googleslides',
        action: 'create',
        requiresApproval: true
      }
    })
  })

  it('keeps connector read actions approval-free', () => {
    expect(
      classifyBrokIntent(userMessage('show my GitHub pull requests'))
    ).toMatchObject({
      intent: 'connector_action',
      connector: {
        toolkit: 'github',
        action: 'read',
        requiresApproval: false
      }
    })
  })
})

describe('resolveSearchModeForIntent', () => {
  it('routes factual prompts into source-backed search mode', () => {
    expect(
      resolveSearchModeForIntent({
        intent: 'quick_search',
        requestedSearchMode: 'deep'
      })
    ).toBe('search')
  })

  it('keeps utility prompts in quick mode', () => {
    expect(
      resolveSearchModeForIntent({
        intent: 'utility',
        requestedSearchMode: 'search'
      })
    ).toBe('quick')
  })

  it('keeps explicit deep research in deep mode', () => {
    expect(
      resolveSearchModeForIntent({
        intent: 'deep_research',
        requestedSearchMode: 'quick'
      })
    ).toBe('deep')
  })
})
