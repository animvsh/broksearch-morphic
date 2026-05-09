import { relations } from 'drizzle-orm';
import { boolean, decimal, index,integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Enums
export const planEnum = pgEnum('plan', ['free', 'starter', 'pro', 'team', 'scale', 'enterprise']);
export const keyStatusEnum = pgEnum('key_status', ['active', 'paused', 'revoked']);
export const environmentEnum = pgEnum('environment', ['test', 'live']);
export const endpointEnum = pgEnum('endpoint', ['chat', 'search', 'code', 'agents']);

// Workspaces
export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  ownerUserId: text('owner_user_id').notNull(),
  plan: planEnum('plan').default('free').notNull(),
  status: text('status').default('active').notNull(),
  monthlyBudgetCents: integer('monthly_budget_cents').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// API Keys
export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id).notNull(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  keyPrefix: text('key_prefix').notNull(), // brok_sk_live_xxxx
  keyHash: text('key_hash').notNull(),    // sha256 hash
  environment: environmentEnum('environment').notNull(),
  status: keyStatusEnum('status').default('active').notNull(),
  scopes: jsonb('scopes').default([]).notNull(), // ['chat:write', 'search:write']
  allowedModels: jsonb('allowed_models').default([]).notNull(),
  rpmLimit: integer('rpm_limit').default(60),
  dailyRequestLimit: integer('daily_request_limit').default(5000),
  monthlyBudgetCents: integer('monthly_budget_cents').default(0),
  lastUsedAt: timestamp('last_used_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  revokedAt: timestamp('revoked_at'),
}, (table) => ({
  workspaceIdx: index('api_keys_workspace_idx').on(table.workspaceId),
  keyHashIdx: index('api_keys_key_hash_idx').on(table.keyHash),
}));

// Usage Events
export const usageEvents = pgTable('usage_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  requestId: text('request_id').notNull(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id).notNull(),
  userId: text('user_id').notNull(),
  apiKeyId: uuid('api_key_id').references(() => apiKeys.id),
  endpoint: endpointEnum('endpoint').notNull(),
  model: text('model').notNull(),
  provider: text('provider').notNull(),
  inputTokens: integer('input_tokens').default(0),
  outputTokens: integer('output_tokens').default(0),
  cachedTokens: integer('cached_tokens').default(0),
  searchQueries: integer('search_queries').default(0),
  pagesFetched: integer('pages_fetched').default(0),
  toolCalls: integer('tool_calls').default(0),
  providerCostUsd: decimal('provider_cost_usd', { precision: 10, scale: 6 }).default('0'),
  billedUsd: decimal('billed_usd', { precision: 10, scale: 6 }).default('0'),
  latencyMs: integer('latency_ms').default(0),
  status: text('status').default('success').notNull(),
  errorCode: text('error_code'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  workspaceIdx: index('usage_events_workspace_idx').on(table.workspaceId),
  apiKeyIdx: index('usage_events_api_key_idx').on(table.apiKeyId),
  createdAtIdx: index('usage_events_created_at_idx').on(table.createdAt),
}));

// Rate Limit Events
export const rateLimitEvents = pgTable('rate_limit_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id).notNull(),
  apiKeyId: uuid('api_key_id').references(() => apiKeys.id),
  limitType: text('limit_type').notNull(), // rpm, daily, monthly, budget
  limitValue: integer('limit_value').notNull(),
  currentValue: integer('current_value').notNull(),
  blocked: boolean('blocked').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Provider Routes
export const providerRoutes = pgTable('provider_routes', {
  id: uuid('id').primaryKey().defaultRandom(),
  brokModel: text('brok_model').notNull(),
  providerName: text('provider_name').notNull(),
  providerModel: text('provider_model').notNull(),
  priority: integer('priority').default(1),
  isActive: boolean('is_active').default(true).notNull(),
  inputCostPerMillion: decimal('input_cost_per_million', { precision: 10, scale: 4 }).default('0'),
  outputCostPerMillion: decimal('output_cost_per_million', { precision: 10, scale: 4 }).default('0'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  brokModelIdx: index('provider_routes_brok_model_idx').on(table.brokModel),
}));

// Relations
export const workspacesRelations = relations(workspaces, ({ many }) => ({
  apiKeys: many(apiKeys),
  usageEvents: many(usageEvents),
}));

export const apiKeysRelations = relations(apiKeys, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [apiKeys.workspaceId], references: [workspaces.id] }),
  usageEvents: many(usageEvents),
}));
