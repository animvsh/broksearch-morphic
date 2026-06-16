import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { canUseDevDbFallback } from '../dev-db-fallback'

describe('canUseDevDbFallback', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'test')
    delete process.env.BROK_CLOUD_DEPLOYMENT
    delete process.env.BROK_DEV_DB_FALLBACK
    delete process.env.RAILWAY_ENVIRONMENT
    delete process.env.RAILWAY_PROJECT_ID
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('allows local fallback for missing BrokCode app-builder tables', () => {
    expect(
      canUseDevDbFallback(
        new Error('failed query: relation "brokcode_projects" does not exist')
      )
    ).toBe(true)
  })

  it('allows local fallback for database connectivity failures', () => {
    expect(
      canUseDevDbFallback(new Error('connect ECONNREFUSED 127.0.0.1'))
    ).toBe(true)
  })

  it('does not hide BrokCode table failures in production', () => {
    vi.stubEnv('NODE_ENV', 'production')

    expect(
      canUseDevDbFallback(
        new Error('failed query: relation "brokcode_projects" does not exist')
      )
    ).toBe(false)
  })

  it('does not hide BrokCode table failures in cloud deployments', () => {
    process.env.BROK_CLOUD_DEPLOYMENT = 'true'

    expect(
      canUseDevDbFallback(
        new Error(
          'failed query: relation "brokcode_runtime_sandboxes" does not exist'
        )
      )
    ).toBe(false)
  })

  it('does not hide generic failed queries', () => {
    expect(canUseDevDbFallback(new Error('failed query: syntax error'))).toBe(
      false
    )
  })
})
