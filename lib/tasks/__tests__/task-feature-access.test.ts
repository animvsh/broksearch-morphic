import { describe, expect, it } from 'vitest'

import { AppAccessResult } from '@/lib/auth/app-access'

import {
  canAccessTaskKind,
  getRequiredFeatureForTaskKind
} from '../task-feature-access'

function allowedAccess(
  features: Extract<AppAccessResult, { allowed: true }>['features']
): AppAccessResult {
  return {
    allowed: true,
    user: { id: 'user_123' } as any,
    source: 'database',
    features
  }
}

describe('task feature access', () => {
  it('requires brokcode access for BrokCode tasks', () => {
    expect(getRequiredFeatureForTaskKind('brokcode')).toBe('brokcode')
    expect(canAccessTaskKind(allowedAccess(['brokcode']), 'brokcode')).toBe(
      true
    )
    expect(canAccessTaskKind(allowedAccess(['search']), 'brokcode')).toBe(false)
  })

  it('requires search access for non-BrokCode tasks', () => {
    expect(getRequiredFeatureForTaskKind('deep-research')).toBe('search')
    expect(canAccessTaskKind(allowedAccess(['search']), 'deep-research')).toBe(
      true
    )
    expect(
      canAccessTaskKind(allowedAccess(['brokcode']), 'deep-research')
    ).toBe(false)
  })

  it('allows all-feature access to read both task families', () => {
    const access = allowedAccess('all')

    expect(canAccessTaskKind(access, 'brokcode')).toBe(true)
    expect(canAccessTaskKind(access, 'deep-research')).toBe(true)
  })
})
