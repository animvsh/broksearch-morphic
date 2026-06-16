import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/app-access', () => ({
  requireFeatureAccessForApi: vi.fn()
}))

vi.mock('@/lib/auth/get-current-user', () => ({
  getCurrentUser: vi.fn()
}))

vi.mock('@/lib/integrations/composio', () => ({
  createConnectedAccountLink: vi.fn(),
  isComposioConfigured: vi.fn()
}))

import { requireFeatureAccessForApi } from '@/lib/auth/app-access'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import {
  createConnectedAccountLink,
  isComposioConfigured
} from '@/lib/integrations/composio'

import { POST as createIntegrationConnection } from '../[toolkit]/connect/route'

function connectRequest(body?: unknown) {
  return new Request('https://brok.test/api/integrations/slack/connect', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      host: 'brok.test',
      'x-forwarded-proto': 'https'
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
}

describe('generic integration connect route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireFeatureAccessForApi).mockResolvedValue({
      ok: true
    } as any)
    vi.mocked(getCurrentUser).mockResolvedValue({ id: 'user_123' } as any)
    vi.mocked(isComposioConfigured).mockReturnValue(true)
  })

  it('normalizes Slack and creates a safe same-origin callback URL', async () => {
    vi.mocked(createConnectedAccountLink).mockResolvedValue({
      raw: { provider_secret: 'hidden' },
      url: 'https://connect.example.com/slack'
    } as any)

    const response = await createIntegrationConnection(
      connectRequest({
        redirectUrl: 'https://evil.example.com/steal'
      }) as any,
      { params: Promise.resolve({ toolkit: 'Slack' }) }
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      provider: 'composio',
      ok: true,
      toolkit: 'slack',
      connectionUrl: 'https://connect.example.com/slack',
      redirectUrl:
        'https://brok.test/integrations?integration=slack&connection=callback'
    })
    expect(createConnectedAccountLink).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_123',
        toolkitSlug: 'slack',
        redirectUrl:
          'https://brok.test/integrations?integration=slack&connection=callback'
      })
    )
  })

  it('does not return raw Composio payloads when link creation fails', async () => {
    vi.mocked(createConnectedAccountLink).mockResolvedValue({
      raw: {
        provider_secret: 'should-not-leak',
        nested: { token: 'also-hidden' }
      },
      url: undefined
    } as any)

    const response = await createIntegrationConnection(
      connectRequest() as any,
      { params: Promise.resolve({ toolkit: 'slack' }) }
    )
    const body = await response.json()

    expect(response.status).toBe(502)
    expect(body).toEqual({
      provider: 'composio',
      ok: false,
      toolkit: 'slack',
      connectionUrl: null,
      redirectUrl:
        'https://brok.test/integrations?integration=slack&connection=callback',
      message:
        'Could not create a Composio connection link for slack. Check that the auth config is enabled and has a valid callback URL.'
    })
  })

  it('hides thrown provider error details from users', async () => {
    vi.mocked(createConnectedAccountLink).mockRejectedValue(
      new Error('provider_secret=shh token=abc123')
    )

    const response = await createIntegrationConnection(
      connectRequest() as any,
      { params: Promise.resolve({ toolkit: 'slack' }) }
    )
    const body = await response.json()

    expect(response.status).toBe(502)
    expect(body.message).toBe(
      'Could not create a Composio connection link for slack. Check that the auth config is enabled and has a valid callback URL.'
    )
    expect(JSON.stringify(body)).not.toContain('provider_secret')
    expect(JSON.stringify(body)).not.toContain('abc123')
  })
})
