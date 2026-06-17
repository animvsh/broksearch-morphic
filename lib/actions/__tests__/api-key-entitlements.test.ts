import type { User } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import type { AppAccessResult, AppFeature } from '@/lib/auth/app-access'

import { assertApiKeyEntitlements } from '../api-key-entitlements'

function access(features: AppFeature[]): AppAccessResult {
  return {
    allowed: true,
    features,
    source: 'database',
    user: { id: 'user-1', email: 'user@example.com' } as User
  }
}

describe('assertApiKeyEntitlements', () => {
  it('allows basic chat and search keys with API platform access', () => {
    expect(() =>
      assertApiKeyEntitlements(access(['api_platform']), {
        scopes: ['chat:write', 'search:write'],
        allowedModels: ['brok-fast', 'brok-search']
      })
    ).not.toThrow()
  })

  it('requires BrokCode access for code scopes and models', () => {
    expect(() =>
      assertApiKeyEntitlements(access(['api_platform']), {
        scopes: ['code:write'],
        allowedModels: []
      })
    ).toThrow('BrokCode access is required')

    expect(() =>
      assertApiKeyEntitlements(access(['api_platform']), {
        scopes: ['chat:write'],
        allowedModels: ['brok-code']
      })
    ).toThrow('BrokCode access is required')
  })

  it('requires Tools access for agent scopes and models', () => {
    expect(() =>
      assertApiKeyEntitlements(access(['api_platform']), {
        scopes: ['agents:write'],
        allowedModels: []
      })
    ).toThrow('Tools access is required')

    expect(() =>
      assertApiKeyEntitlements(access(['api_platform']), {
        scopes: ['chat:write'],
        allowedModels: ['brok-agent']
      })
    ).toThrow('Tools access is required')
  })

  it('allows privileged keys when the account has matching features', () => {
    expect(() =>
      assertApiKeyEntitlements(access(['api_platform', 'brokcode', 'tools']), {
        scopes: ['code:write', 'agents:write'],
        allowedModels: ['brok-code', 'brok-agent']
      })
    ).not.toThrow()
  })
})
