import { relations } from 'drizzle-orm'
import {
  boolean,
  decimal,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from 'drizzle-orm/pg-core'

// Enums
export const planEnum = pgEnum('plan', [
  'free',
  'starter',
  'pro',
  'team',
  'scale',
  'enterprise'
])
export const keyStatusEnum = pgEnum('key_status', [
  'active',
  'paused',
  'revoked'
])
export const environmentEnum = pgEnum('environment', ['test', 'live'])
export const endpointEnum = pgEnum('endpoint', [
  'chat',
  'search',
  'code',
  'agents'
])

// Workspaces
export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  ownerUserId: text('owner_user_id').notNull(),
  plan: planEnum('plan').default('free').notNull(),
  status: text('status').default('active').notNull(),
  monthlyBudgetCents: integer('monthly_budget_cents').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull()
})

// API Keys
export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id)
      .notNull(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    keyPrefix: text('key_prefix').notNull(), // brok_sk_live_xxxx
    keyHash: text('key_hash').notNull(), // sha256 hash
    environment: environmentEnum('environment').notNull(),
    status: keyStatusEnum('status').default('active').notNull(),
    scopes: jsonb('scopes').default([]).notNull(), // ['chat:write', 'search:write']
    allowedModels: jsonb('allowed_models').default([]).notNull(),
    rpmLimit: integer('rpm_limit').default(60),
    dailyRequestLimit: integer('daily_request_limit').default(5000),
    monthlyBudgetCents: integer('monthly_budget_cents').default(0),
    lastUsedAt: timestamp('last_used_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    revokedAt: timestamp('revoked_at')
  },
  table => ({
    workspaceIdx: index('api_keys_workspace_idx').on(table.workspaceId),
    keyHashIdx: index('api_keys_key_hash_idx').on(table.keyHash)
  })
)

// Usage Events
export const usageEvents = pgTable(
  'usage_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestId: text('request_id').notNull(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id)
      .notNull(),
    userId: text('user_id').notNull(),
    apiKeyId: uuid('api_key_id').references(() => apiKeys.id),
    endpoint: endpointEnum('endpoint').notNull(),
    model: text('model').notNull(),
    provider: text('provider').notNull(),
    surface: text('surface').default('api').notNull(),
    runtime: text('runtime'),
    source: text('source'),
    sessionId: text('session_id'),
    inputTokens: integer('input_tokens').default(0),
    outputTokens: integer('output_tokens').default(0),
    cachedTokens: integer('cached_tokens').default(0),
    searchQueries: integer('search_queries').default(0),
    pagesFetched: integer('pages_fetched').default(0),
    toolCalls: integer('tool_calls').default(0),
    providerCostUsd: decimal('provider_cost_usd', {
      precision: 10,
      scale: 6
    }).default('0'),
    billedUsd: decimal('billed_usd', { precision: 10, scale: 6 }).default('0'),
    latencyMs: integer('latency_ms').default(0),
    status: text('status').default('success').notNull(),
    errorCode: text('error_code'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  table => ({
    workspaceIdx: index('usage_events_workspace_idx').on(table.workspaceId),
    apiKeyIdx: index('usage_events_api_key_idx').on(table.apiKeyId),
    surfaceIdx: index('usage_events_surface_idx').on(table.surface),
    sourceIdx: index('usage_events_source_idx').on(table.source),
    sessionIdx: index('usage_events_session_idx').on(table.sessionId),
    createdAtIdx: index('usage_events_created_at_idx').on(table.createdAt)
  })
)

// Rate Limit Events
export const rateLimitEvents = pgTable('rate_limit_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .references(() => workspaces.id)
    .notNull(),
  apiKeyId: uuid('api_key_id').references(() => apiKeys.id),
  limitType: text('limit_type').notNull(), // rpm, daily, monthly, budget
  limitValue: integer('limit_value').notNull(),
  currentValue: integer('current_value').notNull(),
  blocked: boolean('blocked').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull()
})

// Provider Routes
export const providerRoutes = pgTable(
  'provider_routes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    brokModel: text('brok_model').notNull(),
    providerName: text('provider_name').notNull(),
    providerModel: text('provider_model').notNull(),
    priority: integer('priority').default(1),
    isActive: boolean('is_active').default(true).notNull(),
    inputCostPerMillion: decimal('input_cost_per_million', {
      precision: 10,
      scale: 4
    }).default('0'),
    outputCostPerMillion: decimal('output_cost_per_million', {
      precision: 10,
      scale: 4
    }).default('0'),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  table => ({
    brokModelIdx: index('provider_routes_brok_model_idx').on(table.brokModel)
  })
)

// BrokCode saved runtime keys
export const brokCodeRuntimeKeys = pgTable(
  'brokcode_runtime_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id)
      .notNull(),
    userId: text('user_id').notNull(),
    apiKeyId: uuid('api_key_id').references(() => apiKeys.id),
    keyName: text('key_name').notNull(),
    keyPrefix: text('key_prefix').notNull(),
    encryptedKey: text('encrypted_key').notNull(),
    environment: environmentEnum('environment').notNull(),
    scopes: jsonb('scopes').default([]).notNull(),
    defaultSessionId: text('default_session_id').default('default').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    lastValidatedAt: timestamp('last_validated_at').defaultNow().notNull()
  },
  table => ({
    workspaceUserUniqueIdx: uniqueIndex(
      'brokcode_runtime_keys_workspace_user_unique_idx'
    ).on(table.workspaceId, table.userId),
    workspaceIdx: index('brokcode_runtime_keys_workspace_idx').on(
      table.workspaceId
    ),
    userIdx: index('brokcode_runtime_keys_user_idx').on(table.userId)
  })
)

export const brokCodeSessions = pgTable(
  'brokcode_sessions',
  {
    rowId: text('row_id').primaryKey(),
    sessionId: text('session_id').notNull(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id)
      .notNull(),
    userId: text('user_id').notNull(),
    title: text('title').notNull(),
    sources: jsonb('sources').default([]).notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  table => ({
    workspaceSessionUniqueIdx: uniqueIndex(
      'brokcode_sessions_workspace_session_unique_idx'
    ).on(table.workspaceId, table.sessionId),
    workspaceIdx: index('brokcode_sessions_workspace_idx').on(
      table.workspaceId
    ),
    userIdx: index('brokcode_sessions_user_idx').on(table.userId),
    updatedAtIdx: index('brokcode_sessions_updated_at_idx').on(table.updatedAt)
  })
)

export const brokCodeSessionEvents = pgTable(
  'brokcode_session_events',
  {
    id: text('id').primaryKey(),
    sessionRowId: text('session_row_id')
      .references(() => brokCodeSessions.rowId)
      .notNull(),
    sessionId: text('session_id').notNull(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id)
      .notNull(),
    userId: text('user_id').notNull(),
    source: text('source').notNull(),
    role: text('role').notNull(),
    type: text('type').notNull(),
    content: text('content').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  table => ({
    sessionRowIdx: index('brokcode_session_events_session_row_idx').on(
      table.sessionRowId
    ),
    sessionIdx: index('brokcode_session_events_session_idx').on(
      table.sessionId
    ),
    workspaceIdx: index('brokcode_session_events_workspace_idx').on(
      table.workspaceId
    ),
    createdAtIdx: index('brokcode_session_events_created_at_idx').on(
      table.createdAt
    )
  })
)

export const brokCodeVersions = pgTable(
  'brokcode_versions',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').notNull(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id)
      .notNull(),
    userId: text('user_id').notNull(),
    command: text('command').notNull(),
    summary: text('summary').notNull(),
    runtime: text('runtime').notNull(),
    status: text('status').notNull(),
    previewUrl: text('preview_url'),
    branch: text('branch'),
    commitSha: text('commit_sha'),
    prUrl: text('pr_url'),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  table => ({
    workspaceIdx: index('brokcode_versions_workspace_idx').on(
      table.workspaceId
    ),
    sessionIdx: index('brokcode_versions_session_idx').on(table.sessionId),
    createdAtIdx: index('brokcode_versions_created_at_idx').on(table.createdAt)
  })
)

export const brokMailApprovalConsumptions = pgTable(
  'brokmail_approval_consumptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    approvalId: text('approval_id').notNull(),
    userId: text('user_id').notNull(),
    action: text('action').notNull(),
    payloadHash: text('payload_hash').notNull(),
    consumedAt: timestamp('consumed_at').defaultNow().notNull()
  },
  table => ({
    approvalUserUniqueIdx: uniqueIndex(
      'brokmail_approval_consumptions_approval_user_unique_idx'
    ).on(table.approvalId, table.userId),
    userIdx: index('brokmail_approval_consumptions_user_idx').on(table.userId),
    consumedAtIdx: index('brokmail_approval_consumptions_consumed_at_idx').on(
      table.consumedAt
    )
  })
)

// Relations
export const workspacesRelations = relations(workspaces, ({ many }) => ({
  apiKeys: many(apiKeys),
  usageEvents: many(usageEvents),
  brokCodeRuntimeKeys: many(brokCodeRuntimeKeys),
  brokCodeSessions: many(brokCodeSessions),
  brokCodeVersions: many(brokCodeVersions)
}))

export const apiKeysRelations = relations(apiKeys, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [apiKeys.workspaceId],
    references: [workspaces.id]
  }),
  usageEvents: many(usageEvents)
}))

export const brokCodeRuntimeKeysRelations = relations(
  brokCodeRuntimeKeys,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [brokCodeRuntimeKeys.workspaceId],
      references: [workspaces.id]
    }),
    apiKey: one(apiKeys, {
      fields: [brokCodeRuntimeKeys.apiKeyId],
      references: [apiKeys.id]
    })
  })
)

export const brokCodeSessionsRelations = relations(
  brokCodeSessions,
  ({ one, many }) => ({
    workspace: one(workspaces, {
      fields: [brokCodeSessions.workspaceId],
      references: [workspaces.id]
    }),
    events: many(brokCodeSessionEvents)
  })
)

export const brokCodeSessionEventsRelations = relations(
  brokCodeSessionEvents,
  ({ one }) => ({
    session: one(brokCodeSessions, {
      fields: [brokCodeSessionEvents.sessionRowId],
      references: [brokCodeSessions.rowId]
    }),
    workspace: one(workspaces, {
      fields: [brokCodeSessionEvents.workspaceId],
      references: [workspaces.id]
    })
  })
)

export const brokCodeVersionsRelations = relations(
  brokCodeVersions,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [brokCodeVersions.workspaceId],
      references: [workspaces.id]
    })
  })
)
