import { describe, expect, it } from 'vitest'

import { canUseGenericBrokFallback } from '@/lib/brokcode/fallback-policy'

describe('canUseGenericBrokFallback', () => {
  it('does not let browser build/edit/deploy requests override runtime fallback policy', () => {
    for (const commandType of ['build', 'fix', 'deploy']) {
      expect(
        canUseGenericBrokFallback({
          source: 'browser',
          commandType,
          allowBrokFallback: true
        })
      ).toBe(false)
    }
  })

  it('allows browser verification-style commands to use generic fallback', () => {
    expect(
      canUseGenericBrokFallback({
        source: 'browser',
        commandType: 'verify',
        allowBrokFallback: false
      })
    ).toBe(true)
    expect(
      canUseGenericBrokFallback({
        source: 'browser',
        commandType: 'security_scan',
        allowBrokFallback: true
      })
    ).toBe(true)
  })

  it('honors explicit no-fallback requests from non-browser clients', () => {
    expect(
      canUseGenericBrokFallback({
        source: 'api',
        commandType: 'build',
        allowBrokFallback: false
      })
    ).toBe(false)
    expect(
      canUseGenericBrokFallback({
        source: 'tui',
        commandType: 'fix',
        allowBrokFallback: false
      })
    ).toBe(false)
    expect(
      canUseGenericBrokFallback({
        source: 'worker',
        commandType: 'deploy',
        allowBrokFallback: false
      })
    ).toBe(false)
  })

  it('keeps non-browser fallback available when explicitly allowed', () => {
    expect(
      canUseGenericBrokFallback({
        source: 'api',
        commandType: 'build',
        allowBrokFallback: true
      })
    ).toBe(true)
  })
})
