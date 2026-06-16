import { describe, expect, it } from 'vitest'

import {
  generateApiKey,
  getKeyPrefix,
  hashApiKey,
  verifyApiKey
} from '../../api-key'

describe('API Key Functions', () => {
  it('generates a key with correct prefix', () => {
    const key = generateApiKey('live')
    expect(key.startsWith('brok_sk_live_')).toBe(true)
  })

  it('generates a key with correct prefix for test', () => {
    const key = generateApiKey('test')
    expect(key.startsWith('brok_sk_test_')).toBe(true)
  })

  it('stores a lookup prefix that includes random key material', () => {
    const key = 'brok_sk_live_abcdefghijklmnopqrstuvwxyz'
    const prefix = getKeyPrefix(key)
    expect(prefix).toBe('brok_sk_live_abcdefg')
    expect(prefix).not.toBe('brok_sk_live')
  })

  it('hashes a key consistently', () => {
    const key = 'brok_sk_live_abc123'
    const hash1 = hashApiKey(key)
    const hash2 = hashApiKey(key)
    expect(hash1).toBe(hash2)
    expect(hash1).not.toBe(key)
  })

  it('verifies a valid key', () => {
    const key = generateApiKey('live')
    const hash = hashApiKey(key)
    expect(verifyApiKey(key, hash)).toBe(true)
  })

  it('rejects an invalid key', () => {
    const key = generateApiKey('live')
    const hash = hashApiKey(key)
    expect(verifyApiKey('wrong_key', hash)).toBe(false)
  })
})
