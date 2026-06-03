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
export const appProjectStatusEnum = pgEnum('app_project_status', [
  'draft',
  'generating',
  'preview_ready',
  'build_failed',
  'exported',
  'deleted',
  'suspended'
])
export const appGenerationStatusEnum = pgEnum('app_generation_status', [
  'started',
  'completed',
  'failed'
])
export const appExportStatusEnum = pgEnum('app_export_status', [
  'pending',
  'processing',
  'completed',
  'failed'
])
export const presentationShareStatusEnum = pgEnum('presentation_share_status', [
  'active',
  'revoked',
  'expired'
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
export const exportStatusEnum = pgEnum('export_status', [
  'pending',
  'processing',
  'completed',
  'failed'
])
export const generationStatusEnum = pgEnum('generation_status', [
  'started',
  'completed',
  'failed'
])
export const outlineStatusEnum = pgEnum('outline_status', [
  'generating',
  'ready',
  'error'
])
export const presentationStatusEnum = pgEnum('presentation_status', [
  'draft',
  'generating',
  'outline_generating',
  'slides_generating',
  'ready',
  'error'
])

// Admin audit logs — every privileged admin action is recorded
// so support, finance, and owners can answer "who did what, when."
export const adminAuditLogs = pgTable(
  'admin_audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    adminUserId: text('admin_user_id'),
    adminEmail: text('admin_email'),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id'),
    beforeValue: jsonb('before_value').$type<Record<string, unknown>>(),
    afterValue: jsonb('after_value').$type<Record<string, unknown>>(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  table => ({
    adminUserIdx: index('admin_audit_logs_admin_user_idx').on(
      table.adminUserId
    ),
    actionIdx: index('admin_audit_logs_action_idx').on(table.action),
    targetIdx: index('admin_audit_logs_target_idx').on(
      table.targetType,
      table.targetId
    ),
    createdAtIdx: index('admin_audit_logs_created_at_idx').on(
      table.createdAt.desc()
    )
  })
)

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
    keyHash: text('key_hash').notNull(), // sha256(key + key_salt + global_salt)
    keySalt: text('key_salt'), // per-key random salt; null for legacy keys
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
  brokCodeGenerations: many(brokCodeGenerations),
  brokCodeBuilds: many(brokCodeBuilds),
  brokCodeExports: many(brokCodeExports),
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
    runtimeSandboxes: many(brokCodeRuntimeSandboxes),
    generations: many(brokCodeGenerations),
    builds: many(brokCodeBuilds),
    exports: many(brokCodeExports)
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

// ==================== Presentations ====================
//
// 7 tables persisted by `drizzle/0011_bitter_celestials.sql` and refined
// across migrations 0012/0015/0016/0017/0018/0019. Source of truth for these
// definitions is the SQL migrations on disk — keep this schema in lockstep
// with `drizzle/00XX_*.sql`. RLS policies are managed via inline Drizzle SQL
// migrations (see `drizzle/00XX_presentation_*.sql`); the application uses
// `app.current_user_id` via `withRLS` for all reads/writes.

export const presentations = pgTable(
  'presentations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    workspaceId: uuid('workspace_id'),
    title: text('title').notNull(),
    description: text('description'),
    status: presentationStatusEnum('status').default('draft').notNull(),
    themeId: text('theme_id'),
    language: text('language').default('en').notNull(),
    style: text('style'),
    slideCount: integer('slide_count').default(0).notNull(),
    shareId: text('share_id'),
    isPublic: boolean('is_public').default(false).notNull(),
    sourceMarkdown: text('source_markdown'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  table => [
    uniqueIndex('presentations_share_id_unique').on(table.shareId),
    index('presentations_user_id_idx').on(table.userId),
    index('presentations_user_id_created_at_idx').on(
      table.userId,
      table.createdAt.desc()
    ),
    index('presentations_workspace_id_idx').on(table.workspaceId),
    index('presentations_share_id_idx').on(table.shareId)
  ]
)

export const presentationSlides = pgTable(
  'presentation_slides',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    presentationId: uuid('presentation_id')
      .notNull()
      .references(() => presentations.id, { onDelete: 'cascade' }),
    slideIndex: integer('slide_index').notNull(),
    title: text('title').notNull(),
    layoutType: text('layout_type').notNull(),
    contentJson: jsonb('content_json').notNull(),
    speakerNotes: text('speaker_notes'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  table => [
    uniqueIndex('presentation_slides_presentation_id_index_idx').on(
      table.presentationId,
      table.slideIndex
    ),
    index('presentation_slides_presentation_id_idx').on(table.presentationId)
  ]
)

export const presentationOutlines = pgTable(
  'presentation_outlines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    presentationId: uuid('presentation_id')
      .notNull()
      .references(() => presentations.id, { onDelete: 'cascade' }),
    outlineJson: jsonb('outline_json').notNull(),
    status: outlineStatusEnum('status').default('generating').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  table => [
    uniqueIndex('presentation_outlines_presentation_id_unique').on(
      table.presentationId
    ),
    index('presentation_outlines_presentation_id_idx').on(table.presentationId)
  ]
)

export const presentationThemes = pgTable(
  'presentation_themes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id'),
    name: text('name').notNull(),
    themeJson: jsonb('theme_json').notNull(),
    isBuiltin: boolean('is_builtin').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  table => [
    index('presentation_themes_user_id_idx').on(table.userId),
    index('presentation_themes_is_builtin_idx').on(table.isBuiltin)
  ]
)

export const presentationAssets = pgTable(
  'presentation_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    presentationId: uuid('presentation_id')
      .notNull()
      .references(() => presentations.id, { onDelete: 'cascade' }),
    slideId: uuid('slide_id').references(() => presentationSlides.id, {
      onDelete: 'cascade'
    }),
    assetType: text('asset_type').notNull(),
    url: text('url'),
    provider: text('provider').notNull(),
    prompt: text('prompt'),
    metadataJson: jsonb('metadata_json'),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  table => [
    index('presentation_assets_presentation_id_idx').on(table.presentationId),
    index('presentation_assets_slide_id_idx').on(table.slideId)
  ]
)

export const presentationGenerations = pgTable(
  'presentation_generations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    presentationId: uuid('presentation_id')
      .notNull()
      .references(() => presentations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    prompt: text('prompt').notNull(),
    generationType: text('generation_type').notNull(),
    model: text('model').notNull(),
    webSearchEnabled: boolean('web_search_enabled').default(false).notNull(),
    inputTokens: integer('input_tokens').default(0).notNull(),
    outputTokens: integer('output_tokens').default(0).notNull(),
    costUsd: integer('cost_usd').default(0).notNull(),
    status: generationStatusEnum('status').default('started').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  table => [
    index('presentation_generations_presentation_id_idx').on(
      table.presentationId
    ),
    index('presentation_generations_user_id_idx').on(table.userId),
    index('presentation_generations_created_at_idx').on(table.createdAt)
  ]
)

export const presentationExports = pgTable(
  'presentation_exports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    presentationId: uuid('presentation_id')
      .notNull()
      .references(() => presentations.id, { onDelete: 'cascade' }),
    exportType: text('export_type').notNull(),
    fileUrl: text('file_url'),
    status: exportStatusEnum('status').default('pending').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  table => [
    index('presentation_exports_presentation_id_idx').on(table.presentationId),
    index('presentation_exports_status_idx').on(table.status)
  ]
)

export const presentationShares = pgTable(
  'presentation_shares',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    presentationId: uuid('presentation_id')
      .notNull()
      .references(() => presentations.id, { onDelete: 'cascade' }),
    shareId: text('share_id').notNull(),
    isPublic: boolean('is_public').default(false).notNull(),
    status: presentationShareStatusEnum('status').default('active').notNull(),
    viewCount: integer('view_count').default(0).notNull(),
    lastViewedAt: timestamp('last_viewed_at'),
    expiresAt: timestamp('expires_at'),
    revokedAt: timestamp('revoked_at'),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  table => [
    uniqueIndex('presentation_shares_share_id_unique').on(table.shareId),
    index('presentation_shares_presentation_id_idx').on(table.presentationId),
    index('presentation_shares_status_idx').on(table.status)
  ]
)

export const brokCodeGenerations = pgTable(
  'brokcode_generations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => brokCodeProjects.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    userId: text('user_id').notNull(),
    prompt: text('prompt').notNull(),
    model: text('model').notNull(),
    inputTokens: integer('input_tokens').default(0).notNull(),
    outputTokens: integer('output_tokens').default(0).notNull(),
    costUsd: decimal('cost_usd', { precision: 10, scale: 6 })
      .default('0')
      .notNull(),
    filesChanged: jsonb('files_changed')
      .$type<string[]>()
      .default([])
      .notNull(),
    buildResult: text('build_result').default('pending'),
    status: appGenerationStatusEnum('status').default('started').notNull(),
    errorCode: text('error_code'),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  table => [
    index('brokcode_generations_project_idx').on(table.projectId),
    index('brokcode_generations_workspace_idx').on(table.workspaceId),
    index('brokcode_generations_user_idx').on(table.userId),
    index('brokcode_generations_status_idx').on(table.status),
    index('brokcode_generations_created_at_idx').on(table.createdAt.desc())
  ]
)

export const brokCodeBuilds = pgTable(
  'brokcode_builds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => brokCodeProjects.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    userId: text('user_id').notNull(),
    buildCommand: text('build_command'),
    installCommand: text('install_command'),
    status: text('status').default('queued').notNull(),
    durationMs: integer('duration_ms').default(0).notNull(),
    installLogs: text('install_logs'),
    typeErrors: jsonb('type_errors').$type<unknown[]>().default([]),
    viteErrors: jsonb('vite_errors').$type<unknown[]>().default([]),
    repairAttempts: integer('repair_attempts').default(0).notNull(),
    finalStatus: text('final_status'),
    errorCode: text('error_code'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  table => [
    index('brokcode_builds_project_idx').on(table.projectId),
    index('brokcode_builds_workspace_idx').on(table.workspaceId),
    index('brokcode_builds_status_idx').on(table.status),
    index('brokcode_builds_created_at_idx').on(table.createdAt.desc())
  ]
)

export const brokCodeExports = pgTable(
  'brokcode_exports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => brokCodeProjects.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    userId: text('user_id').notNull(),
    exportType: text('export_type').notNull(),
    fileUrl: text('file_url'),
    status: appExportStatusEnum('status').default('pending').notNull(),
    errorCode: text('error_code'),
    costUsd: decimal('cost_usd', { precision: 10, scale: 6 })
      .default('0')
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  table => [
    index('brokcode_exports_project_idx').on(table.projectId),
    index('brokcode_exports_workspace_idx').on(table.workspaceId),
    index('brokcode_exports_status_idx').on(table.status)
  ]
)

export const presentationsRelations = relations(presentations, ({ many }) => ({
  slides: many(presentationSlides),
  outline: many(presentationOutlines),
  assets: many(presentationAssets),
  generations: many(presentationGenerations),
  exports: many(presentationExports),
  shares: many(presentationShares)
}))

export const presentationSlidesRelations = relations(
  presentationSlides,
  ({ one, many }) => ({
    presentation: one(presentations, {
      fields: [presentationSlides.presentationId],
      references: [presentations.id]
    }),
    assets: many(presentationAssets)
  })
)

export const presentationOutlinesRelations = relations(
  presentationOutlines,
  ({ one }) => ({
    presentation: one(presentations, {
      fields: [presentationOutlines.presentationId],
      references: [presentations.id]
    })
  })
)

export const presentationAssetsRelations = relations(
  presentationAssets,
  ({ one }) => ({
    presentation: one(presentations, {
      fields: [presentationAssets.presentationId],
      references: [presentations.id]
    }),
    slide: one(presentationSlides, {
      fields: [presentationAssets.slideId],
      references: [presentationSlides.id]
    })
  })
)

export const presentationGenerationsRelations = relations(
  presentationGenerations,
  ({ one }) => ({
    presentation: one(presentations, {
      fields: [presentationGenerations.presentationId],
      references: [presentations.id]
    })
  })
)

export const presentationExportsRelations = relations(
  presentationExports,
  ({ one }) => ({
    presentation: one(presentations, {
      fields: [presentationExports.presentationId],
      references: [presentations.id]
    })
  })
)

export const presentationSharesRelations = relations(
  presentationShares,
  ({ one }) => ({
    presentation: one(presentations, {
      fields: [presentationShares.presentationId],
      references: [presentations.id]
    })
  })
)

export const brokCodeGenerationsRelations = relations(
  brokCodeGenerations,
  ({ one }) => ({
    project: one(brokCodeProjects, {
      fields: [brokCodeGenerations.projectId],
      references: [brokCodeProjects.id]
    }),
    workspace: one(workspaces, {
      fields: [brokCodeGenerations.workspaceId],
      references: [workspaces.id]
    })
  })
)

// ============================================================================
// Brok Library, Spaces, and Discover
// ============================================================================

export const libraryItemKindEnum = pgEnum('library_item_kind', [
  'search',
  'chat',
  'project',
  'presentation',
  'api_session'
])

export const libraryItemStatusEnum = pgEnum('library_item_status', [
  'active',
  'archived',
  'shared',
  'deleted'
])

export const spaceRoleEnum = pgEnum('space_role', ['owner', 'editor', 'viewer'])

export const spaceVisibilityEnum = pgEnum('space_visibility', [
  'private',
  'link',
  'public'
])

export const discoverItemKindEnum = pgEnum('discover_item_kind', [
  'thread',
  'project',
  'presentation',
  'prompt',
  'api_session'
])

export const discoverCategoryEnum = pgEnum('discover_category', [
  'ai_apps',
  'search',
  'code',
  'chat',
  'presentations'
])

// Library tags (per user, optional cross-item labels)
export const libraryTags = pgTable(
  'library_tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    color: text('color'),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  table => [
    uniqueIndex('library_tags_user_id_name_unique').on(
      table.userId,
      table.name
    ),
    index('library_tags_user_id_idx').on(table.userId)
  ]
)

// Library items — every user-created artifact in one table for filtering
export const libraryItems = pgTable(
  'library_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    kind: libraryItemKindEnum('kind').notNull(),
    title: text('title').notNull(),
    summary: text('summary'),
    href: text('href').notNull(),
    model: text('model'),
    status: libraryItemStatusEnum('status').default('active').notNull(),
    isPublic: boolean('is_public').default(false).notNull(),
    useCount: integer('use_count').default(0).notNull(),
    citeCount: integer('cite_count').default(0).notNull(),
    sourceRefId: text('source_ref_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    lastUsedAt: timestamp('last_used_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  table => [
    index('library_items_user_id_idx').on(table.userId),
    index('library_items_user_id_kind_idx').on(table.userId, table.kind),
    index('library_items_user_id_status_idx').on(table.userId, table.status),
    index('library_items_user_id_updated_idx').on(
      table.userId,
      table.updatedAt.desc()
    ),
    index('library_items_user_id_use_count_idx').on(
      table.userId,
      table.useCount.desc()
    ),
    index('library_items_user_id_cite_count_idx').on(
      table.userId,
      table.citeCount.desc()
    )
  ]
)

// Many-to-many between library items and tags
export const libraryItemTags = pgTable(
  'library_item_tags',
  {
    libraryItemId: uuid('library_item_id')
      .notNull()
      .references(() => libraryItems.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => libraryTags.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  table => [
    uniqueIndex('library_item_tags_unique').on(
      table.libraryItemId,
      table.tagId
    ),
    index('library_item_tags_tag_idx').on(table.tagId)
  ]
)

// Spaces — collaborative workspaces
export const spaces = pgTable(
  'spaces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    ownerUserId: text('owner_user_id').notNull(),
    visibility: spaceVisibilityEnum('visibility').default('private').notNull(),
    inviteToken: text('invite_token'),
    iconColor: text('icon_color'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    memberCount: integer('member_count').default(1).notNull(),
    threadCount: integer('thread_count').default(0).notNull(),
    projectCount: integer('project_count').default(0).notNull(),
    presentationCount: integer('presentation_count').default(0).notNull(),
    lastActivityAt: timestamp('last_activity_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  table => [
    uniqueIndex('spaces_slug_unique').on(table.slug),
    index('spaces_owner_user_id_idx').on(table.ownerUserId),
    index('spaces_visibility_idx').on(table.visibility),
    index('spaces_last_activity_idx').on(table.lastActivityAt.desc())
  ]
)

export const spaceMembers = pgTable(
  'space_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    email: text('email'),
    displayName: text('display_name'),
    role: spaceRoleEnum('role').default('editor').notNull(),
    lastActiveAt: timestamp('last_active_at'),
    invitedAt: timestamp('invited_at').defaultNow().notNull(),
    acceptedAt: timestamp('accepted_at')
  },
  table => [
    uniqueIndex('space_members_space_user_unique').on(
      table.spaceId,
      table.userId
    ),
    index('space_members_user_id_idx').on(table.userId),
    index('space_members_space_id_idx').on(table.spaceId)
  ]
)

export const spaceProjects = pgTable(
  'space_projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    status: text('status').default('active').notNull(),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  table => [
    index('space_projects_space_id_idx').on(table.spaceId),
    index('space_projects_space_id_updated_idx').on(
      table.spaceId,
      table.updatedAt.desc()
    )
  ]
)

export const spaceInvites = pgTable(
  'space_invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: spaceRoleEnum('role').default('viewer').notNull(),
    token: text('token').notNull(),
    invitedBy: text('invited_by').notNull(),
    expiresAt: timestamp('expires_at'),
    acceptedAt: timestamp('accepted_at'),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  table => [
    uniqueIndex('space_invites_token_unique').on(table.token),
    index('space_invites_space_id_idx').on(table.spaceId),
    index('space_invites_email_idx').on(table.email)
  ]
)

// Discover — public feed of trending content
export const discoverItems = pgTable(
  'discover_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: discoverItemKindEnum('kind').notNull(),
    category: discoverCategoryEnum('category').notNull(),
    title: text('title').notNull(),
    summary: text('summary'),
    authorName: text('author_name'),
    authorHandle: text('author_handle'),
    href: text('href').notNull(),
    thumbnailUrl: text('thumbnail_url'),
    likeCount: integer('like_count').default(0).notNull(),
    saveCount: integer('save_count').default(0).notNull(),
    shareCount: integer('share_count').default(0).notNull(),
    viewCount: integer('view_count').default(0).notNull(),
    isFeatured: boolean('is_featured').default(false).notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    publishedAt: timestamp('published_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  table => [
    index('discover_items_category_idx').on(table.category),
    index('discover_items_kind_idx').on(table.kind),
    index('discover_items_published_at_idx').on(table.publishedAt.desc()),
    index('discover_items_featured_idx').on(table.isFeatured),
    index('discover_items_like_count_idx').on(table.likeCount.desc())
  ]
)

export const trendingTopics = pgTable(
  'trending_topics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    label: text('label').notNull(),
    category: discoverCategoryEnum('category').notNull(),
    velocity: integer('velocity').default(0).notNull(),
    window: text('window').default('24h').notNull(),
    rank: integer('rank').default(0).notNull(),
    capturedAt: timestamp('captured_at').defaultNow().notNull()
  },
  table => [
    index('trending_topics_category_idx').on(table.category),
    index('trending_topics_window_idx').on(table.window),
    index('trending_topics_rank_idx').on(table.rank)
  ]
)

// Relations
export const libraryTagsRelations = relations(libraryTags, ({ many }) => ({
  itemTags: many(libraryItemTags)
}))

export const libraryItemsRelations = relations(libraryItems, ({ many }) => ({
  tags: many(libraryItemTags)
}))

export const libraryItemTagsRelations = relations(
  libraryItemTags,
  ({ one }) => ({
    item: one(libraryItems, {
      fields: [libraryItemTags.libraryItemId],
      references: [libraryItems.id]
    }),
    tag: one(libraryTags, {
      fields: [libraryItemTags.tagId],
      references: [libraryTags.id]
    })
  })
)

export const brokCodeBuildsRelations = relations(brokCodeBuilds, ({ one }) => ({
  project: one(brokCodeProjects, {
    fields: [brokCodeBuilds.projectId],
    references: [brokCodeProjects.id]
  }),
  workspace: one(workspaces, {
    fields: [brokCodeBuilds.workspaceId],
    references: [workspaces.id]
  })
}))

export const brokCodeExportsRelations = relations(
  brokCodeExports,
  ({ one }) => ({
    project: one(brokCodeProjects, {
      fields: [brokCodeExports.projectId],
      references: [brokCodeProjects.id]
    }),
    workspace: one(workspaces, {
      fields: [brokCodeExports.workspaceId],
      references: [workspaces.id]
    })
  })
)

export const spacesRelations = relations(spaces, ({ many }) => ({
  members: many(spaceMembers),
  projects: many(spaceProjects),
  invites: many(spaceInvites)
}))

export const spaceMembersRelations = relations(spaceMembers, ({ one }) => ({
  space: one(spaces, {
    fields: [spaceMembers.spaceId],
    references: [spaces.id]
  })
}))

export const spaceProjectsRelations = relations(spaceProjects, ({ one }) => ({
  space: one(spaces, {
    fields: [spaceProjects.spaceId],
    references: [spaces.id]
  })
}))

export const spaceInvitesRelations = relations(spaceInvites, ({ one }) => ({
  space: one(spaces, {
    fields: [spaceInvites.spaceId],
    references: [spaces.id]
  })
}))
