import { describe, expect, it } from 'vitest'

import {
  filterSearchModelsByProvider,
  isSupportedSearchModel
} from '../search-models'

describe('search model selector helpers', () => {
  it('accepts only openai-compatible models with search support', () => {
    expect(
      isSupportedSearchModel({
        id: 'brok-m2-7-highspeed',
        providerId: 'openai-compatible'
      })
    ).toBe(true)
    expect(
      isSupportedSearchModel({
        id: 'brok-search',
        providerId: 'openai-compatible'
      })
    ).toBe(true)
    expect(
      isSupportedSearchModel({
        id: 'brok-code',
        providerId: 'openai-compatible'
      })
    ).toBe(false)
    expect(
      isSupportedSearchModel({
        id: 'gpt-4o',
        providerId: 'openai'
      })
    ).toBe(false)
  })

  it('removes unsupported providers and unsupported Brok aliases', () => {
    const filtered = filterSearchModelsByProvider({
      OpenAI: [
        {
          id: 'gpt-4o',
          name: 'GPT-4o',
          provider: 'OpenAI',
          providerId: 'openai'
        }
      ],
      Brok: [
        {
          id: 'brok-code',
          name: 'Brok Code',
          provider: 'Brok',
          providerId: 'openai-compatible'
        },
        {
          id: 'brok-search',
          name: 'Brok Search',
          provider: 'Brok',
          providerId: 'openai-compatible'
        }
      ]
    })

    expect(filtered).toEqual({
      Brok: [
        {
          id: 'brok-search',
          name: 'Brok Search',
          provider: 'Brok',
          providerId: 'openai-compatible'
        }
      ]
    })
  })
})
