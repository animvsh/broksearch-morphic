import { afterEach, describe, expect, it, vi } from 'vitest'

import { createConnectedAccountLink } from '../composio'

describe('Composio integration', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.COMPOSIO_API_KEY
    delete process.env.COMPOSIO_GITHUB_AUTH_CONFIG_ID
    delete process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID
    delete process.env.COMPOSIO_GOOGLEDOCS_AUTH_CONFIG_ID
    delete process.env.COMPOSIO_GOOGLEMEET_AUTH_CONFIG_ID
  })

  it('accepts v3.1 auth configs where toolkit is an object with a slug', async () => {
    process.env.COMPOSIO_API_KEY = 'test-composio-key'
    process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID = 'ac_gmail'

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async input => {
        const url = String(input)

        if (url.includes('/auth_configs/ac_gmail')) {
          return Response.json({
            data: {
              id: 'ac_gmail',
              name: 'gmail-yinrea',
              status: 'ENABLED',
              toolkit: {
                slug: 'gmail'
              }
            }
          })
        }

        if (url.includes('/connected_accounts/link')) {
          return Response.json({
            data: {
              redirect_url: 'https://connect.composio.dev/gmail'
            }
          })
        }

        return Response.json({ error: 'unexpected url' }, { status: 404 })
      })

    const link = await createConnectedAccountLink({
      userId: 'user_123',
      toolkitSlug: 'gmail',
      redirectUrl: 'https://brok.test/brokmail?gmail=connected'
    })

    expect(link.url).toBe('https://connect.composio.dev/gmail')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('resolves GitHub and Google Workspace auth config env aliases', async () => {
    process.env.COMPOSIO_API_KEY = 'test-composio-key'
    process.env.COMPOSIO_GITHUB_AUTH_CONFIG_ID = 'ac_github'
    process.env.COMPOSIO_GOOGLEDOCS_AUTH_CONFIG_ID = 'ac_docs'
    process.env.COMPOSIO_GOOGLEMEET_AUTH_CONFIG_ID = 'ac_meet'

    const toolkitByConfigId = new Map([
      ['ac_github', 'github'],
      ['ac_docs', 'googledocs'],
      ['ac_meet', 'googlemeet']
    ])
    const requestedConfigIds: string[] = []

    vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const url = String(input)
      const authConfigMatch = url.match(/\/auth_configs\/([^/?]+)/)

      if (authConfigMatch?.[1]) {
        const id = decodeURIComponent(authConfigMatch[1])
        requestedConfigIds.push(id)
        return Response.json({
          data: {
            id,
            status: 'ENABLED',
            toolkit: {
              slug: toolkitByConfigId.get(id)
            }
          }
        })
      }

      if (url.includes('/connected_accounts/link')) {
        return Response.json({
          data: {
            redirect_url: 'https://connect.composio.dev/oauth'
          }
        })
      }

      return Response.json({ error: 'unexpected url' }, { status: 404 })
    })

    await expect(
      createConnectedAccountLink({
        userId: 'user_123',
        toolkitSlug: 'github'
      })
    ).resolves.toMatchObject({
      url: 'https://connect.composio.dev/oauth'
    })
    await expect(
      createConnectedAccountLink({
        userId: 'user_123',
        toolkitSlug: 'googledocs'
      })
    ).resolves.toMatchObject({
      url: 'https://connect.composio.dev/oauth'
    })
    await expect(
      createConnectedAccountLink({
        userId: 'user_123',
        toolkitSlug: 'googlemeet'
      })
    ).resolves.toMatchObject({
      url: 'https://connect.composio.dev/oauth'
    })

    expect(requestedConfigIds).toEqual(['ac_github', 'ac_docs', 'ac_meet'])
  })
})
