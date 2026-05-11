import { tool } from 'ai'
import { z } from 'zod'

import {
  createConnectedAccountLink,
  isComposioConfigured,
  isComposioConnectMode,
  listAuthConfigs,
  listConnectedAccounts
} from '@/lib/integrations/composio'

const composioActionSchema = z.enum([
  'status',
  'list_connected_accounts',
  'list_auth_configs',
  'create_connection_link'
])

const composioIntegrationInputSchema = z.object({
  action: composioActionSchema.describe(
    'Requested integration action to run with Composio'
  ),
  toolkitSlug: z
    .string()
    .optional()
    .describe(
      'Toolkit slug such as gmail, github, linear or slack for filtering.'
    ),
  authConfigId: z
    .string()
    .optional()
    .describe('Auth config id if you already know which one to use.'),
  redirectUrl: z
    .string()
    .url()
    .optional()
    .describe('Optional redirect URL after the user finishes OAuth.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .optional()
    .describe('Maximum number of rows to return for listing actions.')
})

export function createComposioIntegrationTool(userId?: string) {
  return tool({
    description:
      'Manage Composio integrations for chat/agent workflows. Use this tool to inspect connection status and create OAuth connection links.',
    inputSchema: composioIntegrationInputSchema,
    async *execute({
      action,
      toolkitSlug,
      authConfigId,
      redirectUrl,
      limit = 20
    }) {
      const subjectUserId = userId || 'guest'

      yield {
        state: 'checking' as const,
        action,
        toolkitSlug: toolkitSlug || null
      }

      if (!isComposioConfigured()) {
        yield {
          state: 'complete' as const,
          success: false,
          configured: false,
          message:
            'Composio is not configured. Set COMPOSIO_API_KEY or COMPOSIO_CONNECT_KEY to enable integrations.',
          action
        }
        return
      }

      try {
        if (action === 'status') {
          const accounts = await listConnectedAccounts(
            subjectUserId,
            toolkitSlug,
            limit
          )

          yield {
            state: 'complete' as const,
            success: true,
            configured: true,
            action,
            connectedAccounts: accounts,
            connectedCount: accounts.length,
            message:
              accounts.length > 0
                ? `Composio is configured and has ${accounts.length} connected account(s).`
                : 'Composio is configured but no connected accounts were found.'
          }
          return
        }

        if (action === 'list_connected_accounts') {
          const accounts = await listConnectedAccounts(
            subjectUserId,
            toolkitSlug,
            limit
          )

          yield {
            state: 'complete' as const,
            success: true,
            configured: true,
            action,
            connectedAccounts: accounts,
            connectedCount: accounts.length
          }
          return
        }

        if (action === 'list_auth_configs') {
          const authConfigs = await listAuthConfigs(toolkitSlug)
          yield {
            state: 'complete' as const,
            success: true,
            configured: true,
            action,
            authConfigs,
            authConfigCount: authConfigs.length
          }
          return
        }

        if (isComposioConnectMode()) {
          if (!toolkitSlug && !authConfigId) {
            yield {
              state: 'complete' as const,
              success: false,
              configured: true,
              action,
              message:
                'Composio Connect mode needs toolkitSlug for connection links (for example toolkitSlug: "linear").'
            }
            return
          }

          const link = await createConnectedAccountLink({
            authConfigId,
            userId: subjectUserId,
            toolkitSlug,
            redirectUrl
          })

          yield {
            state: 'complete' as const,
            success: true,
            configured: true,
            action,
            authConfigId: authConfigId || null,
            connectionUrl: link.url || null,
            message: link.url
              ? 'Generated Composio connection link.'
              : 'Composio responded, but no connection URL was returned.',
            raw: link.raw
          }
          return
        }

        let resolvedAuthConfigId = authConfigId
        if (!resolvedAuthConfigId) {
          const toolkitEnvKey = toolkitSlug
            ? `COMPOSIO_${toolkitSlug.toUpperCase()}_AUTH_CONFIG_ID`
            : undefined
          const envFallback =
            process.env.COMPOSIO_AUTH_CONFIG_ID ||
            (toolkitEnvKey ? process.env[toolkitEnvKey] : undefined)

          const authConfigs = await listAuthConfigs(toolkitSlug)
          resolvedAuthConfigId =
            authConfigs.find(config =>
              toolkitSlug
                ? config.toolkit_slug === toolkitSlug && config.id
                : config.id
            )?.id ||
            envFallback ||
            undefined
        }

        if (!resolvedAuthConfigId) {
          yield {
            state: 'complete' as const,
            success: false,
            configured: true,
            action,
            message:
              'Could not find a matching Composio auth config. Provide authConfigId or toolkitSlug.'
          }
          return
        }

        const link = await createConnectedAccountLink({
          authConfigId: resolvedAuthConfigId,
          userId: subjectUserId,
          toolkitSlug,
          redirectUrl
        })

        yield {
          state: 'complete' as const,
          success: true,
          configured: true,
          action,
          authConfigId: resolvedAuthConfigId,
          connectionUrl: link.url || null,
          message: link.url
            ? 'Generated Composio connection link.'
            : 'Composio responded, but no connection URL was returned.',
          raw: link.raw
        }
      } catch (error) {
        yield {
          state: 'complete' as const,
          success: false,
          configured: true,
          action,
          message:
            error instanceof Error
              ? error.message
              : 'Composio integration request failed.'
        }
      }
    }
  })
}
