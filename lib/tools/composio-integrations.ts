import { tool } from 'ai'
import { z } from 'zod'

import {
  createConnectedAccountLink,
  executeComposioTool,
  isComposioConfigured,
  isComposioConnectMode,
  listAuthConfigs,
  listConnectedAccounts
} from '@/lib/integrations/composio'

const composioActionSchema = z.enum([
  'status',
  'list_connected_accounts',
  'list_auth_configs',
  'create_connection_link',
  'execute_tool'
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
    .describe('Maximum number of rows to return for listing actions.'),
  toolSlug: z
    .string()
    .optional()
    .describe(
      'Composio tool slug to execute, such as GMAIL_CREATE_EMAIL_DRAFT.'
    ),
  text: z
    .string()
    .optional()
    .describe('Natural-language execution instruction for the Composio tool.'),
  arguments: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Structured arguments for the Composio tool when known.'),
  connectedAccountId: z
    .string()
    .optional()
    .describe('Specific Composio connected account id to run the tool with.')
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
      limit = 20,
      toolSlug,
      text,
      arguments: toolArguments,
      connectedAccountId
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

        if (action === 'execute_tool') {
          if (!userId) {
            yield {
              state: 'complete' as const,
              success: false,
              configured: true,
              action,
              message: 'Sign in to Brok before running connector actions.'
            }
            return
          }

          if (!toolSlug) {
            yield {
              state: 'complete' as const,
              success: false,
              configured: true,
              action,
              message:
                'A Composio toolSlug is required to execute a connector action.'
            }
            return
          }

          let resolvedConnectedAccountId = connectedAccountId
          if (!resolvedConnectedAccountId && toolkitSlug) {
            const accounts = await listConnectedAccounts(
              subjectUserId,
              toolkitSlug,
              10
            )
            resolvedConnectedAccountId = accounts.find(account => {
              const status = account.status?.toLowerCase()
              return (
                !status || ['active', 'connected', 'enabled'].includes(status)
              )
            })?.id
          }

          const result = await executeComposioTool({
            toolSlug,
            userId: subjectUserId,
            connectedAccountId: resolvedConnectedAccountId,
            text,
            arguments: toolArguments
          })

          yield {
            state: 'complete' as const,
            success: true,
            configured: true,
            action,
            toolSlug,
            connectedAccountId: resolvedConnectedAccountId || null,
            message: `Executed Composio tool ${toolSlug}.`,
            result
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
