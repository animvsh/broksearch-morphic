import { afterEach, describe, expect, it, vi } from 'vitest'

import { createConnectedAccountLink, listConnectedAccounts } from '../composio'

describe('Composio integration', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.COMPOSIO_API_KEY
    delete process.env.COMPOSIO_CONNECT_KEY
    delete process.env.COMPOSIO_FORCE_BACKEND_MODE
    delete process.env.COMPOSIO_GITHUB_AUTH_CONFIG_ID
    delete process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID
    delete process.env.COMPOSIO_GOOGLEDOCS_AUTH_CONFIG_ID
    delete process.env.COMPOSIO_GOOGLESLIDES_AUTH_CONFIG_ID
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

  it('prefers Connect MCP for OAuth links when both connect and backend keys exist', async () => {
    process.env.COMPOSIO_CONNECT_KEY = 'ck_test_connect_key'
    process.env.COMPOSIO_API_KEY = 'test-backend-key'
    process.env.COMPOSIO_GOOGLESLIDES_AUTH_CONFIG_ID = 'ac_slides'

    const requestedUrls: string[] = []
    const toolkitNames: unknown[] = []

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      requestedUrls.push(url)

      if (typeof init?.body === 'string') {
        const parsedBody = JSON.parse(init.body)
        toolkitNames.push(parsedBody.params?.arguments?.toolkits)
      }

      if (url.includes('/mcp')) {
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
                      googleslides: {
                        connect_url: 'https://connect.composio.dev/googleslides'
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

    await expect(
      createConnectedAccountLink({
        userId: 'user_123',
        toolkitSlug: 'google-slides'
      })
    ).resolves.toMatchObject({
      url: 'https://connect.composio.dev/googleslides'
    })

    expect(requestedUrls).toEqual(['https://connect.composio.dev/mcp'])
    expect(toolkitNames).toEqual([[{ name: 'googleslides', action: 'add' }]])
  })

<<<<<<< HEAD
  it('keeps Connect MCP account listing non-blocking when a toolkit status request fails', async () => {
    process.env.COMPOSIO_CONNECT_KEY = 'ck_test_connect_key'

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 500 })
    )

    await expect(
      listConnectedAccounts('user_123', 'googleslides')
    ).resolves.toEqual([])
  })

  it('falls back to backend auth config links when Connect MCP cannot start OAuth', async () => {
    process.env.COMPOSIO_CONNECT_KEY = 'ck_test_connect_key'
    process.env.COMPOSIO_API_KEY = 'test-backend-key'
    process.env.COMPOSIO_GOOGLESLIDES_AUTH_CONFIG_ID = 'ac_slides'

    const requestedUrls: string[] = []

    vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const url = String(input)
      requestedUrls.push(url)

      if (url.includes('/mcp')) {
        return new Response('', { status: 500 })
      }

      if (url.includes('/auth_configs/ac_slides')) {
        return Response.json({
          data: {
            id: 'ac_slides',
            status: 'ENABLED',
            toolkit: {
              slug: 'googleslides'
            }
          }
        })
      }

      if (url.includes('/connected_accounts/link')) {
        return Response.json({
          data: {
            redirect_url: 'https://backend.composio.dev/slides-oauth'
          }
        })
      }

      return Response.json({ error: 'unexpected url' }, { status: 404 })
    })

    await expect(
      createConnectedAccountLink({
        userId: 'user_123',
        toolkitSlug: 'google-slides'
      })
    ).resolves.toMatchObject({
      url: 'https://backend.composio.dev/slides-oauth'
    })

    expect(requestedUrls).toEqual([
      'https://connect.composio.dev/mcp',
      'https://backend.composio.dev/api/v3.1/connected_accounts/link'
    ])
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
