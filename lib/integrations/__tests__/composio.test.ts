import { afterEach, describe, expect, it, vi } from 'vitest'

import { createConnectedAccountLink } from '../composio'

describe('Composio integration', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.COMPOSIO_API_KEY
    delete process.env.COMPOSIO_CONNECT_KEY
    delete process.env.COMPOSIO_GITHUB_AUTH_CONFIG_ID
    delete process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID
    delete process.env.COMPOSIO_GOOGLEDOCS_AUTH_CONFIG_ID
    delete process.env.COMPOSIO_GOOGLEMEET_AUTH_CONFIG_ID
  })

  it('forwards connect-mode callback urls for OAuth redirection', async () => {
    process.env.COMPOSIO_CONNECT_KEY = 'ck_test_connect_key'
    const redirectUrl = 'https://brok.test/integrations?integration=github'

    const connectRequestPayload: {
      jsonrpc?: string
      method?: string
      params?: {
        arguments?: Record<string, unknown>
      }
    } = {}

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        const url = String(input)

        if (url.includes('/mcp')) {
          expect(url).toBe('https://connect.composio.dev/mcp')

          if (typeof init?.body === 'string') {
            const parsedBody = JSON.parse(init.body)
            connectRequestPayload.jsonrpc = parsedBody.jsonrpc
            connectRequestPayload.method = parsedBody.method
            connectRequestPayload.params = parsedBody.params
          }

          return Response.json({
            jsonrpc: '2.0',
            id: 1,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    data: {
                      results: {
                        github: {
                          connect_url: 'https://connect.composio.dev/github'
                        }
                      }
                    }
                  })
                }
              ]
            }
          })
        }

        return Response.json({ error: 'unexpected url' }, { status: 404 })
      })

    try {
      const request = {
        userId: 'user_123',
        toolkitSlug: 'github',
        redirectUrl
      }

      const link = await createConnectedAccountLink(request)

      expect(link.url).toBe('https://connect.composio.dev/github')
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(connectRequestPayload.jsonrpc).toBe('2.0')
      expect(connectRequestPayload.method).toBe('tools/call')

      const args = connectRequestPayload.params?.arguments
      expect(args?.toolkits).toEqual([{ name: 'github', action: 'add' }])
      expect(args?.session_id).toBe('brok_user_123_github')
      expect(args?.redirect_url).toBe(redirectUrl)
      expect(args?.callback_url).toBe(redirectUrl)
    } finally {
      fetchMock.mockRestore()
    }
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
