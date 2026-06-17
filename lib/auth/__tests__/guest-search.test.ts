import { afterEach, describe, expect, it, vi } from 'vitest'

import { isGuestSearchEnabled, isGuestSearchMode } from '../guest-search'

const originalEnableGuestChat = process.env.ENABLE_GUEST_CHAT
const originalBrokCloudDeployment = process.env.BROK_CLOUD_DEPLOYMENT

describe('guest search access', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    if (originalEnableGuestChat === undefined) {
      delete process.env.ENABLE_GUEST_CHAT
    } else {
      process.env.ENABLE_GUEST_CHAT = originalEnableGuestChat
    }
    if (originalBrokCloudDeployment === undefined) {
      delete process.env.BROK_CLOUD_DEPLOYMENT
    } else {
      process.env.BROK_CLOUD_DEPLOYMENT = originalBrokCloudDeployment
    }
  })

  it('defaults guest search on for local development when unset', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('BROK_CLOUD_DEPLOYMENT', 'false')
    delete process.env.ENABLE_GUEST_CHAT

    expect(isGuestSearchEnabled()).toBe(true)
  })

  it('keeps cloud deployments closed by default', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('BROK_CLOUD_DEPLOYMENT', 'true')
    delete process.env.ENABLE_GUEST_CHAT

    expect(isGuestSearchEnabled()).toBe(false)
  })

  it('keeps production closed by default', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('BROK_CLOUD_DEPLOYMENT', 'false')
    delete process.env.ENABLE_GUEST_CHAT

    expect(isGuestSearchEnabled()).toBe(false)
  })

  it('lets explicit configuration override the local default', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('BROK_CLOUD_DEPLOYMENT', 'false')
    vi.stubEnv('ENABLE_GUEST_CHAT', 'false')

    expect(isGuestSearchEnabled()).toBe(false)

    vi.stubEnv('ENABLE_GUEST_CHAT', 'true')

    expect(isGuestSearchEnabled()).toBe(true)
  })

  it('keeps cloud deployments closed even when guest chat is explicitly enabled', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('BROK_CLOUD_DEPLOYMENT', 'true')
    vi.stubEnv('ENABLE_GUEST_CHAT', 'true')

    expect(isGuestSearchEnabled()).toBe(false)
  })

  it('only treats quick and search as guest-safe modes', () => {
    expect(isGuestSearchMode('quick')).toBe(true)
    expect(isGuestSearchMode('search')).toBe(true)
    expect(isGuestSearchMode('deep')).toBe(false)
  })
})
