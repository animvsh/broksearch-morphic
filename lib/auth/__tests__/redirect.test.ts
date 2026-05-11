import { describe, expect, it } from 'vitest'

import { buildAuthErrorPath, resolveSafeNextPath } from '../redirect'

describe('resolveSafeNextPath', () => {
  it('allows same-app relative paths with query strings and hashes', () => {
    expect(resolveSafeNextPath('/brokcode?tab=cloud#preview')).toBe(
      '/brokcode?tab=cloud#preview'
    )
  })

  it('falls back for absolute and protocol-relative URLs', () => {
    expect(resolveSafeNextPath('https://example.com/brokcode')).toBe('/')
    expect(resolveSafeNextPath('//example.com/brokcode')).toBe('/')
  })

  it('falls back for slash-backslash URLs and malformed paths', () => {
    expect(resolveSafeNextPath('/\\example.com')).toBe('/')
    expect(resolveSafeNextPath('not-a-path')).toBe('/')
  })

  it('supports a safe relative fallback', () => {
    expect(resolveSafeNextPath('//example.com', '/auth/login')).toBe(
      '/auth/login'
    )
  })
})

describe('buildAuthErrorPath', () => {
  it('encodes Supabase error messages safely', () => {
    expect(buildAuthErrorPath('Invalid token & provider')).toBe(
      '/auth/error?error=Invalid+token+%26+provider'
    )
  })
})
