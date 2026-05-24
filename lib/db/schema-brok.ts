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

export const appAccessAllowlist = pgTable(
  'app_access_allowlist',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    status: text('status').default('active').notNull(),
    features: jsonb('features').$type<string[]>(),
    note: text('note'),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    revokedAt: timestamp('revoked_at')
  },
  table => ({
    emailUniqueIdx: uniqueIndex('app_access_allowlist_email_unique_idx').on(
      table.email
    ),
    statusIdx: index('app_access_allowlist_status_idx').on(table.status)
  })
)

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
    checkpointName: text('checkpoint_name'),
    projectId: text('project_id'),
    summary: text('summary').notNull(),
    runtime: text('runtime').notNull(),
    status: text('status').notNull(),
    previewUrl: text('preview_url'),
    deploymentUrl: text('deployment_url'),
    branch: text('branch'),
    commitSha: text('commit_sha'),
    prUrl: text('pr_url'),
    diffMetadata: jsonb('diff_metadata').$type<Record<string, unknown>>(),
    fileSnapshot: jsonb('file_snapshot').$type<Record<string, unknown>[]>(),
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

export const brokCodeProjects = pgTable(
  'brokcode_projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id)
      .notNull(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    username: text('username'),
    status: text('status').default('draft').notNull(),
    previewUrl: text('preview_url'),
    deploymentUrl: text('deployment_url'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  table => ({
    workspaceSlugUniqueIdx: uniqueIndex(
      'brokcode_projects_workspace_slug_unique_idx'
    ).on(table.workspaceId, table.slug),
    workspaceIdx: index('brokcode_projects_workspace_idx').on(
      table.workspaceId
    ),
    userIdx: index('brokcode_projects_user_idx').on(table.userId),
    usernameIdx: index('brokcode_projects_username_idx').on(table.username)
  })
)

export const brokCodeProjectFiles = pgTable(
  'brokcode_project_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .references(() => brokCodeProjects.id)
      .notNull(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id)
      .notNull(),
    path: text('path').notNull(),
    content: text('content').notNull(),
    language: text('language'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  table => ({
    projectPathUniqueIdx: uniqueIndex(
      'brokcode_project_files_project_path_unique_idx'
    ).on(table.projectId, table.path),
    projectIdx: index('brokcode_project_files_project_idx').on(table.projectId),
    workspaceIdx: index('brokcode_project_files_workspace_idx').on(
      table.workspaceId
    )
  })
)

export const brokCodeDeployments = pgTable(
  'brokcode_deployments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .references(() => brokCodeProjects.id)
      .notNull(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id)
      .notNull(),
    userId: text('user_id').notNull(),
    provider: text('provider').default('railway').notNull(),
    status: text('status').default('queued').notNull(),
    url: text('url'),
    subdomain: text('subdomain'),
    logs: jsonb('logs').$type<Array<Record<string, unknown>>>(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  table => ({
    projectIdx: index('brokcode_deployments_project_idx').on(table.projectId),
    workspaceIdx: index('brokcode_deployments_workspace_idx').on(
      table.workspaceId
    ),
    subdomainIdx: index('brokcode_deployments_subdomain_idx').on(
      table.subdomain
    )
  })
)

export const brokCodeRuntimeSandboxes = pgTable(
  'brokcode_runtime_sandboxes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .references(() => brokCodeProjects.id)
      .notNull(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id)
      .notNull(),
    userId: text('user_id').notNull(),
    versionId: text('version_id'),
    sessionId: text('session_id'),
    institutionId: text('institution_id'),
    courseId: text('course_id'),
    sectionId: text('section_id'),
    assignmentId: text('assignment_id'),
    appType: text('app_type').notNull(),
    packageManager: text('package_manager').notNull(),
    workspacePath: text('workspace_path').notNull(),
    installCommand: text('install_command'),
    devCommand: text('dev_command').notNull(),
    buildCommand: text('build_command'),
    status: text('status').default('preparing').notNull(),
    ports: jsonb('ports').$type<Array<Record<string, unknown>>>().default([]),
    logs: jsonb('logs').$type<Array<Record<string, unknown>>>().default([]),
    health: jsonb('health').$type<Record<string, unknown>>(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    startedAt: timestamp('started_at'),
    stoppedAt: timestamp('stopped_at'),
    lastHealthcheckAt: timestamp('last_healthcheck_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  table => ({
    projectIdx: index('brokcode_runtime_sandboxes_project_idx').on(
      table.projectId
    ),
    workspaceIdx: index('brokcode_runtime_sandboxes_workspace_idx').on(
      table.workspaceId
    ),
    userIdx: index('brokcode_runtime_sandboxes_user_idx').on(table.userId),
    statusIdx: index('brokcode_runtime_sandboxes_status_idx').on(table.status),
    versionIdx: index('brokcode_runtime_sandboxes_version_idx').on(
      table.versionId
    ),
    updatedAtIdx: index('brokcode_runtime_sandboxes_updated_at_idx').on(
      table.updatedAt.desc()
    )
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

export const connectorActionRuns = pgTable(
  'connector_action_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    chatId: text('chat_id'),
    toolkit: text('toolkit').notNull(),
    action: text('action').notNull(),
    toolSlug: text('tool_slug'),
    status: text('status').default('pending').notNull(),
    requiresApproval: boolean('requires_approval').default(true).notNull(),
    approvalId: text('approval_id'),
    payloadHash: text('payload_hash').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    result: jsonb('result').$type<Record<string, unknown>>(),
    error: text('error'),
    approvedAt: timestamp('approved_at'),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  table => ({
    userStatusIdx: index('connector_action_runs_user_status_idx').on(
      table.userId,
      table.status
    ),
    toolkitIdx: index('connector_action_runs_toolkit_idx').on(table.toolkit),
    createdAtIdx: index('connector_action_runs_created_at_idx').on(
      table.createdAt.desc()
    )
  })
)

export const connectorApprovalRequests = pgTable(
  'connector_approval_requests',
  {
    id: text('id').primaryKey(),
    runId: uuid('run_id')
      .references(() => connectorActionRuns.id)
      .notNull(),
    userId: text('user_id').notNull(),
    status: text('status').default('pending').notNull(),
    payloadHash: text('payload_hash').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    approvedAt: timestamp('approved_at'),
    consumedAt: timestamp('consumed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  table => ({
    runIdx: index('connector_approval_requests_run_idx').on(table.runId),
    userStatusIdx: index('connector_approval_requests_user_status_idx').on(
      table.userId,
      table.status
    ),
    expiresAtIdx: index('connector_approval_requests_expires_at_idx').on(
      table.expiresAt
    )
  })
)

export const connectorActionEvents = pgTable(
  'connector_action_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .references(() => connectorActionRuns.id)
      .notNull(),
    userId: text('user_id').notNull(),
    eventType: text('event_type').notNull(),
    message: text('message'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  table => ({
    runIdx: index('connector_action_events_run_idx').on(table.runId),
    userIdx: index('connector_action_events_user_idx').on(table.userId),
    createdAtIdx: index('connector_action_events_created_at_idx').on(
      table.createdAt.desc()
    )
  })
)

// Relations
export const workspacesRelations = relations(workspaces, ({ many }) => ({
  apiKeys: many(apiKeys),
  usageEvents: many(usageEvents),
  brokCodeRuntimeKeys: many(brokCodeRuntimeKeys),
  brokCodeSessions: many(brokCodeSessions),
  brokCodeVersions: many(brokCodeVersions),
  brokCodeProjects: many(brokCodeProjects),
  brokCodeRuntimeSandboxes: many(brokCodeRuntimeSandboxes),
  connectorActionRuns: many(connectorActionRuns)
}))

export const apiKeysRelations = relations(apiKeys, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [apiKeys.workspaceId],
    references: [workspaces.id]
  }),
  usageEvents: many(usageEvents)
}))

export const connectorActionRunsRelations = relations(
  connectorActionRuns,
  ({ many }) => ({
    approvals: many(connectorApprovalRequests),
    events: many(connectorActionEvents)
  })
)

export const connectorApprovalRequestsRelations = relations(
  connectorApprovalRequests,
  ({ one }) => ({
    run: one(connectorActionRuns, {
      fields: [connectorApprovalRequests.runId],
      references: [connectorActionRuns.id]
    })
  })
)

export const connectorActionEventsRelations = relations(
  connectorActionEvents,
  ({ one }) => ({
    run: one(connectorActionRuns, {
      fields: [connectorActionEvents.runId],
      references: [connectorActionRuns.id]
    })
  })
)

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

export const brokCodeProjectsRelations = relations(
  brokCodeProjects,
  ({ one, many }) => ({
    workspace: one(workspaces, {
      fields: [brokCodeProjects.workspaceId],
      references: [workspaces.id]
    }),
    files: many(brokCodeProjectFiles),
    deployments: many(brokCodeDeployments),
    runtimeSandboxes: many(brokCodeRuntimeSandboxes)
  })
)

export const brokCodeProjectFilesRelations = relations(
  brokCodeProjectFiles,
  ({ one }) => ({
    project: one(brokCodeProjects, {
      fields: [brokCodeProjectFiles.projectId],
      references: [brokCodeProjects.id]
    }),
    workspace: one(workspaces, {
      fields: [brokCodeProjectFiles.workspaceId],
      references: [workspaces.id]
    })
  })
)

export const brokCodeDeploymentsRelations = relations(
  brokCodeDeployments,
  ({ one }) => ({
    project: one(brokCodeProjects, {
      fields: [brokCodeDeployments.projectId],
      references: [brokCodeProjects.id]
    }),
    workspace: one(workspaces, {
      fields: [brokCodeDeployments.workspaceId],
      references: [workspaces.id]
    })
  })
)

export const brokCodeRuntimeSandboxesRelations = relations(
  brokCodeRuntimeSandboxes,
  ({ one }) => ({
    project: one(brokCodeProjects, {
      fields: [brokCodeRuntimeSandboxes.projectId],
      references: [brokCodeProjects.id]
    }),
    workspace: one(workspaces, {
      fields: [brokCodeRuntimeSandboxes.workspaceId],
      references: [workspaces.id]
    })
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
