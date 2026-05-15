import { describe, expect, it } from 'vitest'

import {
  filterProviderTools,
  isBrokWebSearchToolType,
  isWebSearchToolRequest,
  normalizeProviderToolChoice
} from '../chat/completions/route'

describe('chat completions web search compatibility', () => {
  it('recognizes OpenAI-compatible web search aliases', () => {
    expect(isBrokWebSearchToolType('web_search')).toBe(true)
    expect(isBrokWebSearchToolType('web_search_preview')).toBe(true)
    expect(isBrokWebSearchToolType('web_search_preview_2025_03_11')).toBe(true)
    expect(isBrokWebSearchToolType('function')).toBe(false)
  })

  it('routes web search aliases through Brok search instead of provider tools', () => {
    expect(
      isWebSearchToolRequest([{ type: 'web_search_preview' }], undefined)
    ).toBe(true)
    expect(
      isWebSearchToolRequest([{ type: 'web_search_preview' }], 'auto')
    ).toBe(true)
    expect(isWebSearchToolRequest(undefined, 'web_search_preview')).toBe(true)
    expect(isWebSearchToolRequest([{ type: 'web_search' }], 'none')).toBe(false)
    expect(
      isWebSearchToolRequest([{ type: 'web_search' }], { type: 'function' })
    ).toBe(false)
  })

  it('preserves standard provider tool_choice strings', () => {
    expect(normalizeProviderToolChoice('auto')).toBe('auto')
    expect(normalizeProviderToolChoice('required')).toBe('required')
    expect(normalizeProviderToolChoice('none')).toBeUndefined()
    expect(normalizeProviderToolChoice('web_search_preview')).toBeUndefined()
  })

  it('filters only Brok-owned web search tools before provider forwarding', () => {
    expect(
      filterProviderTools([
        { type: 'web_search_preview' },
        { type: 'function' }
      ])
    ).toEqual([{ type: 'function' }])
  })
})
