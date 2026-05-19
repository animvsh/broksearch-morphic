import { afterEach, describe, expect, it } from 'vitest'

import {
  createInsForgeBackendMetadata,
  decryptInsForgeAdminKey,
  emptyBrokCodeBackendMetadata,
  publicBrokCodeBackendMetadata
} from '../backend-provider'

describe('BrokCode backend provider metadata', () => {
  afterEach(() => {
    delete process.env.BROKCODE_KEY_ENCRYPTION_SECRET
  })

  it('defaults to no configured backend', () => {
    expect(emptyBrokCodeBackendMetadata()).toEqual({
      provider: 'none',
      status: 'not_configured',
      capabilities: {
        database: false,
        auth: false,
        storage: false,
        functions: false,
        realtime: false
      },
      health: 'unknown',
      adminKeyConfigured: false
    })
  })

  it('normalizes InsForge project fields and redacts admin keys', () => {
    process.env.BROKCODE_KEY_ENCRYPTION_SECRET = 'test-secret'

    const backend = createInsForgeBackendMetadata({
      mode: 'trial',
      projectUrl: 'https://example.insforge.app/',
      dashboardUrl: 'https://dashboard.insforge.dev/project/a',
      claimUrl: 'https://insforge.dev/claim/a',
      projectId: 'project_123',
      appkey: 'app_public',
      region: 'us',
      trialExpiresAt: '2026-05-20T10:00:00.000Z',
      adminKey: 'ik_live_secret',
      capabilities: {
        database: true,
        auth: true,
        storage: true,
        functions: true,
        realtime: true
      }
    })

    expect(backend).toMatchObject({
      provider: 'insforge',
      mode: 'trial',
      status: 'ready',
      projectUrl: 'https://example.insforge.app',
      dashboardUrl: 'https://dashboard.insforge.dev/project/a',
      claimUrl: 'https://insforge.dev/claim/a',
      projectId: 'project_123',
      appkey: 'app_public',
      region: 'us',
      adminKeyConfigured: true
    })
    expect(backend.encryptedAdminKey).toBeTruthy()
    expect(backend.encryptedAdminKey).not.toContain('ik_live_secret')
    expect(decryptInsForgeAdminKey(backend)).toBe('ik_live_secret')

    const publicBackend = publicBrokCodeBackendMetadata(backend)
    expect(publicBackend).toMatchObject({
      provider: 'insforge',
      adminKeyConfigured: true
    })
    expect(publicBackend).not.toHaveProperty('encryptedAdminKey')
  })
})
