import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ORIGINAL_ENV = { ...process.env }

function loadDbModule(env: Record<string, string | undefined>) {
  vi.resetModules()
  for (const key of Object.keys(ORIGINAL_ENV)) {
    if (!(key in env)) delete process.env[key]
  }
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  // Suppress the noisy "[DB]" console output during tests.
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  return import('@/lib/db/index')
}

describe('lib/db/index placeholder handling', () => {
  beforeEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in ORIGINAL_ENV)) delete process.env[key]
    }
    for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
      if (value !== undefined) process.env[key] = value
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('falls back to inert URL in development when DATABASE_URL is a placeholder', async () => {
    await expect(
      loadDbModule({
        NODE_ENV: 'development',
        DATABASE_URL: '[YOUR_DATABASE_URL]',
        DATABASE_RESTRICTED_URL: undefined
      })
    ).resolves.toBeDefined()
  })

  it('falls back to inert URL in development when both URLs are empty', async () => {
    await expect(
      loadDbModule({
        NODE_ENV: 'development',
        DATABASE_URL: '',
        DATABASE_RESTRICTED_URL: ''
      })
    ).resolves.toBeDefined()
  })

  it('treats bracketed placeholder as empty regardless of case', async () => {
    await expect(
      loadDbModule({
        NODE_ENV: 'development',
        DATABASE_URL: '[your_database_url]',
        DATABASE_RESTRICTED_URL: '[YOUR_RESTRICTED_URL]'
      })
    ).resolves.toBeDefined()
  })

  it('throws when neither URL is configured and not in dev/test/build', async () => {
    await expect(
      loadDbModule({
        NODE_ENV: 'production',
        DATABASE_URL: undefined,
        DATABASE_RESTRICTED_URL: undefined
      })
    ).rejects.toThrow(/DATABASE_URL/)
  })

  it('accepts a real postgres URL without modification', async () => {
    await expect(
      loadDbModule({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgres://user:pass@localhost:5432/realdb',
        DATABASE_RESTRICTED_URL: undefined
      })
    ).resolves.toBeDefined()
  })

  it('prefers DATABASE_RESTRICTED_URL over DATABASE_URL when both are real', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(
      loadDbModule({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgres://user:pass@localhost:5432/owner',
        DATABASE_RESTRICTED_URL:
          'postgres://app_user:pass@localhost:5432/restricted'
      })
    ).resolves.toBeDefined()
    expect(warn).not.toHaveBeenCalledWith(
      expect.stringContaining('placeholder')
    )
  })
})
