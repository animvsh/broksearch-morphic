import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { canUseUsageDashboardFallback } from '../usage-dashboard-fallback'

describe('usage dashboard fallback', () => {
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

  it('allows local fallback for missing usage ledger tables', () => {
    expect(
      canUseUsageDashboardFallback(
        new Error('failed query: relation "usage_events" does not exist')
      )
    ).toBe(true)
  })

  it('allows local fallback for database connectivity failures', () => {
    expect(
      canUseUsageDashboardFallback(new Error('connect ECONNREFUSED 127.0.0.1'))
    ).toBe(true)
  })

  it('does not hide cloud usage dashboard failures', () => {
    process.env.BROK_CLOUD_DEPLOYMENT = 'true'

    expect(
      canUseUsageDashboardFallback(
        new Error('failed query: relation "usage_events" does not exist')
      )
    ).toBe(false)
  })

  it('does not hide production usage dashboard failures', () => {
    vi.stubEnv('NODE_ENV', 'production')

    expect(
      canUseUsageDashboardFallback(new Error('connect ECONNREFUSED 127.0.0.1'))
    ).toBe(false)
  })

  it('does not hide unrelated query errors', () => {
    expect(canUseUsageDashboardFallback(new Error('division by zero'))).toBe(
      false
    )
  })
})
