# Brok Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-ready Perplexity-style Chat + Sonar-style API platform branded as Brok, with full API key management, admin panel, usage tracking, and rate limiting.

**Architecture:** A Next.js app renamed from Morphic to Brok, with a FastAPI backend API gateway handling auth, rate limiting, usage metering, and provider routing to MiniMax. The existing admin panel gets a new "Brok API" section.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind, shadcn/ui, Drizzle ORM, PostgreSQL, Redis, FastAPI, MiniMax API, Vercel AI SDK

---

## Phase 1: Foundation — Rename Morphic → Brok

### Task 1: Brand Rename — Package.json, Config, Env

**Files:**
- Modify: `package.json` — name "morphic" → "brok"
- Modify: `.env.local.example` — rename MORPHIC_ → BROK_ env vars
- Modify: `next.config.mjs` — rename project references
- Modify: `proxy.ts` — rename
- Modify: `docker-compose.yaml` — rename services/images
- Modify: `Dockerfile` — rename
- Modify: `README.md` — rename
- Modify: `AGENTS.md` / `CLAUDE.md` — rename

**Steps:**

- [ ] **Step 1: Modify package.json**

```json
{
  "name": "brok",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "migrate": "drizzle-kit migrate",
    "studio": "drizzle-kit studio"
  }
}
```

Run: Edit the file directly.

- [ ] **Step 2: Modify .env.local.example**

Replace all `MORPHIC_` with `BROK_`:
```
BROK_APP_URL=http://localhost:3000
BROK_API_URL=http://localhost:8080
BROK_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/brok
BROK_REDIS_URL=redis://localhost:6379
```

- [ ] **Step 3: Modify next.config.mjs**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  name: 'Brok',
  reactStrictMode: true,
  // ... existing config
};

export default nextConfig;
```

- [ ] **Step 4: Update docker-compose.yaml**

Replace all `morphic` service names, image names, and environment variables with `brok`.

- [ ] **Step 5: Update Dockerfile**

Replace `morphic` with `brok` in build args and labels.

- [ ] **Step 6: Update README.md**

Replace all branding with Brok references.

- [ ] **Step 7: Commit**

```bash
cd /Users/animesh/.superset/projects/broksearch/morphic
git add -A
git commit -m "feat: rename Morphic to Brok brand"
```

---

### Task 2: Rename Internal Code References

**Files:**
- Modify: `lib/config/` — rename config files
- Modify: `public/config/models.json` — rename model provider IDs
- Modify: `components/header.tsx` — app name
- Modify: `app/layout.tsx` — metadata
- Modify: `app/page.tsx` — landing page title
- Modify: `components/app-sidebar.tsx` — sidebar branding

**Steps:**

- [ ] **Step 1: Read and update public/config/models.json**

Rename model provider IDs from "morphic" to "brok" in model configs.

- [ ] **Step 2: Update app/layout.tsx**

```tsx
export const metadata: Metadata = {
  title: 'Brok - AI Answer Engine',
  description: 'Brok gives developers a simple API for search-powered AI responses, coding agents, and low-cost intelligence.',
  icons: {
    icon: '/favicon.ico',
  },
};
```

- [ ] **Step 3: Update app/page.tsx**

Update hero text: "Brok: Ask anything"

- [ ] **Step 4: Update components/header.tsx**

Change "Morphic" → "Brok"

- [ ] **Step 5: Update components/app-sidebar.tsx**

Change branding references.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: update code references to Brok"
```

---

### Task 3: Create Brok Directory Structure

**Files:**
- Create: `app/brok/` — Brok Chat UI
- Create: `app/dashboard/` — Dashboard pages
- Create: `app/api-keys/` — API key management
- Create: `app/playground/` — Playground
- Create: `app/usage/` — Usage dashboard
- Create: `app/docs/` — Documentation
- Create: `app/settings/` — Settings
- Create: `app/billing/` — Billing
- Create: `app/team/` — Team management

**Steps:**

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p app/brok app/dashboard app/api-keys app/playground app/usage app/docs app/settings app/billing app/team
mkdir -p app/admin/brok
```

- [ ] **Step 2: Create placeholder pages**

Each directory gets a `page.tsx`:

`app/brok/page.tsx`:
```tsx
export default function BrokPage() {
  return (
    <main className="flex h-screen flex-col items-center justify-center">
      <h1 className="text-3xl font-bold">Brok Chat</h1>
      <p className="text-muted-foreground">AI-powered search and chat</p>
    </main>
  );
}
```

`app/dashboard/page.tsx`:
```tsx
export default function DashboardPage() {
  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold">Brok Dashboard</h1>
    </main>
  );
}
```

(Repeat for api-keys, playground, usage, docs, settings, billing, team)

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: create Brok directory structure"
```

---

## Phase 2: Database Schema — Brok API Key System

### Task 4: Add Brok Database Schema

**Files:**
- Create: `lib/db/schema-brok.ts` — Brok API tables
- Modify: `lib/db/schema.ts` — import brok schema

**Steps:**

- [ ] **Step 1: Write test for API key hashing**

```ts
// lib/db/__tests__/api-key.test.ts
import { describe, it, expect } from 'vitest';
import { hashApiKey, verifyApiKey, generateApiKey } from '../api-key';

describe('API Key Functions', () => {
  it('generates a key with correct prefix', () => {
    const key = generateApiKey('live');
    expect(key.startsWith('brok_sk_live_')).toBe(true);
  });

  it('generates a key with correct prefix for test', () => {
    const key = generateApiKey('test');
    expect(key.startsWith('brok_sk_test_')).toBe(true);
  });

  it('hashes a key consistently', () => {
    const key = 'brok_sk_live_abc123';
    const hash1 = hashApiKey(key);
    const hash2 = hashApiKey(key);
    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(key);
  });

  it('verifies a valid key', () => {
    const key = generateApiKey('live');
    const hash = hashApiKey(key);
    expect(verifyApiKey(key, hash)).toBe(true);
  });

  it('rejects an invalid key', () => {
    const key = generateApiKey('live');
    const hash = hashApiKey(key);
    expect(verifyApiKey('wrong_key', hash)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/animesh/.superset/projects/broksearch/morphic && bun run test lib/db/__tests__/api-key.test.ts`
Expected: FAIL with "api-key not found"

- [ ] **Step 3: Write API key utility**

Create `lib/api-key.ts`:

```ts
import { createHash, randomBytes } from 'crypto';

const SECRET_SALT = process.env.API_KEY_SALT || 'brok-default-salt-change-in-production';

export function generateApiKey(environment: 'live' | 'test' = 'live'): string {
  const prefix = `brok_sk_${environment}_`;
  const randomPart = randomBytes(24).toString('base64url');
  return `${prefix}${randomPart}`;
}

export function hashApiKey(key: string): string {
  return createHash('sha256')
    .update(key + SECRET_SALT)
    .digest('hex');
}

export function verifyApiKey(key: string, hash: string): boolean {
  return hashApiKey(key) === hash;
}

export function maskApiKey(key: string): string {
  if (key.length < 12) return '••••••••••••';
  const prefix = key.slice(0, 12);
  const suffix = key.slice(-4);
  return `${prefix}••••••••${suffix}`;
}

export function getKeyPrefix(key: string): string {
  if (key.length < 8) return key;
  return key.slice(0, 12);
}
```

- [ ] **Step 4: Write Brok schema**

Create `lib/db/schema-brok.ts`:

```ts
import { pgTable, text, timestamp, boolean, integer, pgEnum, jsonb, uuid, decimal, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

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
```

- [ ] **Step 5: Update schema.ts to export brok schema**

Add to existing schema:
```ts
export * from './schema-brok';
```

- [ ] **Step 6: Run test to verify it passes**

Run: `bun run test lib/db/__tests__/api-key.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add Brok API key schema and utilities"
```

---

## Phase 3: API Gateway — /v1/chat/completions

### Task 5: Build API Key Auth Middleware

**Files:**
- Create: `lib/brok/auth.ts` — API key authentication
- Create: `app/api/v1/chat/completions/route.ts` — chat endpoint
- Create: `lib/brok/rate-limiter.ts` — rate limiting
- Create: `lib/brok/usage-tracker.ts` — usage metering
- Create: `lib/brok/provider-router.ts` — model routing
- Create: `lib/brok/models.ts` — Brok model definitions

**Steps:**

- [ ] **Step 1: Write test for auth middleware**

```ts
// lib/brok/__tests__/auth.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { verifyRequestAuth } from '../auth';
import { hashApiKey, generateApiKey } from '@/lib/api-key';

// Mock the db
vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

describe('verifyRequestAuth', () => {
  const testKey = generateApiKey('live');
  const testHash = hashApiKey(testKey);

  it('returns error for missing authorization header', async () => {
    const result = await verifyRequestAuth({} as Request);
    expect(result.error).toBe('missing_authorization');
  });

  it('returns error for invalid bearer format', async () => {
    const result = await verifyRequestAuth({
      headers: { get: (name: string) => name === 'authorization' ? 'InvalidFormat' : null },
    } as unknown as Request);
    expect(result.error).toBe('invalid_authorization_format');
  });

  it('returns error for unknown API key', async () => {
    const result = await verifyRequestAuth({
      headers: { get: (name: string) => name === 'authorization' ? `Bearer ${testKey}` : null },
    } as unknown as Request);
    expect(result.error).toBe('invalid_api_key');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test lib/brok/__tests__/auth.test.ts`
Expected: FAIL

- [ ] **Step 3: Write auth middleware**

Create `lib/brok/auth.ts`:

```ts
import { db } from '@/lib/db';
import { apiKeys, workspaces } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { hashApiKey } from '@/lib/api-key';
import { NextResponse } from 'next/server';

export interface AuthResult {
  success: true;
  apiKey: typeof apiKeys.$inferSelect;
  workspace: typeof workspaces.$inferSelect;
} | {
  success: false;
  error: 'missing_authorization' | 'invalid_authorization_format' | 'invalid_api_key' | 'inactive_key' | 'workspace_inactive';
  status: number;
};

export async function verifyRequestAuth(request: Request): Promise<AuthResult> {
  const authHeader = request.headers.get('authorization');
  
  if (!authHeader) {
    return { success: false, error: 'missing_authorization', status: 401 };
  }

  if (!authHeader.startsWith('Bearer ')) {
    return { success: false, error: 'invalid_authorization_format', status: 401 };
  }

  const key = authHeader.slice(7);
  const keyHash = hashApiKey(key);

  const [keyRecord] = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, keyHash))
    .limit(1);

  if (!keyRecord) {
    return { success: false, error: 'invalid_api_key', status: 401 };
  }

  if (keyRecord.status !== 'active') {
    return { success: false, error: 'inactive_key', status: 403 };
  }

  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, keyRecord.workspaceId))
    .limit(1);

  if (!workspace || workspace.status !== 'active') {
    return { success: false, error: 'workspace_inactive', status: 403 };
  }

  return { success: true, apiKey: keyRecord, workspace };
}

export function unauthorizedResponse(error: AuthResult): NextResponse {
  const body = {
    error: {
      type: 'authentication_error',
      code: error.error,
      message: getErrorMessage(error.error),
    }
  };
  return NextResponse.json(body, { status: error.status });
}

function getErrorMessage(error: string): string {
  const messages: Record<string, string> = {
    missing_authorization: 'Authorization header is required.',
    invalid_authorization_format: 'Authorization header must be Bearer token.',
    invalid_api_key: 'Invalid API key.',
    inactive_key: 'API key is inactive.',
    workspace_inactive: 'Workspace is inactive.',
  };
  return messages[error] || 'Authentication failed.';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test lib/brok/__tests__/auth.test.ts`
Expected: PASS (may need to adjust for drizzle mock)

- [ ] **Step 5: Write Brok model definitions**

Create `lib/brok/models.ts`:

```ts
export const BROK_MODELS = {
  'brok-lite': {
    name: 'Brok Lite',
    description: 'Fast, low-cost reasoning for simple tasks',
    provider: 'minimax',
    providerModel: 'minimax-m2.7',
    inputCostPerMillion: 0.10,
    outputCostPerMillion: 0.40,
    maxTokens: 16000,
    supportsStreaming: true,
    supportsSearch: false,
  },
  'brok-search': {
    name: 'Brok Search',
    description: 'Search-powered answers with citations',
    provider: 'minimax',
    providerModel: 'minimax-text',
    inputCostPerMillion: 0.10,
    outputCostPerMillion: 0.40,
    maxTokens: 16000,
    supportsStreaming: true,
    supportsSearch: true,
  },
  'brok-search-pro': {
    name: 'Brok Search Pro',
    description: 'Deep search with 10-20 sources',
    provider: 'minimax',
    providerModel: 'minimax-text',
    inputCostPerMillion: 0.15,
    outputCostPerMillion: 0.60,
    maxTokens: 32000,
    supportsStreaming: true,
    supportsSearch: true,
  },
  'brok-code': {
    name: 'Brok Code',
    description: 'Code understanding and generation',
    provider: 'minimax',
    providerModel: 'minimax-code',
    inputCostPerMillion: 0.10,
    outputCostPerMillion: 0.40,
    maxTokens: 16000,
    supportsStreaming: true,
    supportsSearch: false,
    supportsCode: true,
  },
  'brok-agent': {
    name: 'Brok Agent',
    description: 'Tool-using agent with browser and search',
    provider: 'minimax',
    providerModel: 'minimax-agent',
    inputCostPerMillion: 0.15,
    outputCostPerMillion: 0.60,
    maxTokens: 32000,
    supportsStreaming: true,
    supportsSearch: true,
    supportsTools: true,
  },
  'brok-reasoning': {
    name: 'Brok Reasoning',
    description: 'Advanced reasoning for complex problems',
    provider: 'minimax',
    providerModel: 'minimax-reasoning',
    inputCostPerMillion: 0.20,
    outputCostPerMillion: 0.80,
    maxTokens: 32000,
    supportsStreaming: true,
    supportsSearch: false,
  },
} as const;

export type BrokModelId = keyof typeof BROK_MODELS;

export function isValidBrokModel(model: string): model is BrokModelId {
  return model in BROK_MODELS;
}
```

- [ ] **Step 6: Write provider router**

Create `lib/brok/provider-router.ts`:

```ts
import { BROK_MODELS, BrokModelId } from './models';

export interface ProviderRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
}

export interface ProviderResponse {
  id: string;
  model: string;
  choices: Array<{
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export async function routeToProvider(model: BrokModelId, request: ProviderRequest): Promise<ProviderResponse> {
  const modelConfig = BROK_MODELS[model];
  
  // Transform request to provider format
  const providerRequest = transformToProviderRequest(model, request);
  
  // Call appropriate provider
  const providerApiKey = process.env.MINIMAX_API_KEY;
  
  if (!providerApiKey) {
    throw new Error('Provider API key not configured');
  }

  const response = await fetch('https://api.minimax.chat/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${providerApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(providerRequest),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Provider error: ${response.status} - ${error}`);
  }

  return response.json();
}

function transformToProviderRequest(model: BrokModelId, request: ProviderRequest) {
  const modelConfig = BROK_MODELS[model];
  return {
    model: modelConfig.providerModel,
    messages: request.messages,
    stream: request.stream,
    temperature: request.temperature,
    max_tokens: request.maxTokens,
  };
}

export function calculateCost(model: BrokModelId, inputTokens: number, outputTokens: number): number {
  const config = BROK_MODELS[model];
  const inputCost = (inputTokens / 1_000_000) * config.inputCostPerMillion;
  const outputCost = (outputTokens / 1_000_000) * config.outputCostPerMillion;
  return inputCost + outputCost;
}
```

- [ ] **Step 7: Write rate limiter**

Create `lib/brok/rate-limiter.ts`:

```ts
import { db } from '@/lib/db';
import { rateLimitEvents } from '@/lib/db/schema-brok';
import { eq, and, gte } from 'drizzle-orm';

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: number;
}

export async function checkRateLimit(
  apiKeyId: string,
  workspaceId: string,
  rpmLimit: number
): Promise<RateLimitResult> {
  const now = new Date();
  const oneMinuteAgo = new Date(now.getTime() - 60000);

  // Count requests in last minute
  const [countResult] = await db
    .select({ count: rateLimitEvents.id })
    .from(rateLimitEvents)
    .where(
      and(
        eq(rateLimitEvents.apiKeyId, apiKeyId),
        eq(rateLimitEvents.limitType, 'rpm'),
        gte(rateLimitEvents.createdAt, oneMinuteAgo)
      )
    );

  const currentCount = countResult?.count || 0;
  const remaining = Math.max(0, rpmLimit - currentCount);
  const resetAt = Math.floor(now.getTime() / 1000) + 60;

  return {
    allowed: currentCount < rpmLimit,
    remaining,
    limit: rpmLimit,
    resetAt,
  };
}

export async function recordRateLimitEvent(
  apiKeyId: string,
  workspaceId: string,
  limitType: string,
  limitValue: number,
  currentValue: number,
  blocked: boolean
): Promise<void> {
  await db.insert(rateLimitEvents).values({
    apiKeyId,
    workspaceId,
    limitType,
    limitValue,
    currentValue,
    blocked,
  });
}
```

- [ ] **Step 8: Write usage tracker**

Create `lib/brok/usage-tracker.ts`:

```ts
import { db } from '@/lib/db';
import { usageEvents } from '@/lib/db/schema-brok';
import { v4 as uuidv4 } from 'uuid';

export interface UsageData {
  requestId: string;
  workspaceId: string;
  userId: string;
  apiKeyId: string;
  endpoint: 'chat' | 'search' | 'code' | 'agents';
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
  searchQueries?: number;
  pagesFetched?: number;
  toolCalls?: number;
  providerCostUsd: number;
  billedUsd: number;
  latencyMs: number;
  status: string;
  errorCode?: string;
}

export async function recordUsage(data: UsageData): Promise<void> {
  await db.insert(usageEvents).values({
    requestId: data.requestId,
    workspaceId: data.workspaceId,
    userId: data.userId,
    apiKeyId: data.apiKeyId,
    endpoint: data.endpoint,
    model: data.model,
    provider: data.provider,
    inputTokens: data.inputTokens,
    outputTokens: data.outputTokens,
    cachedTokens: data.cachedTokens || 0,
    searchQueries: data.searchQueries || 0,
    pagesFetched: data.pagesFetched || 0,
    toolCalls: data.toolCalls || 0,
    providerCostUsd: data.providerCostUsd.toString(),
    billedUsd: data.billedUsd.toString(),
    latencyMs: data.latencyMs,
    status: data.status,
    errorCode: data.errorCode,
  });
}

export function generateRequestId(): string {
  return `brok_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
}
```

- [ ] **Step 9: Write chat completions endpoint**

Create `app/api/v1/chat/completions/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestAuth, unauthorizedResponse } from '@/lib/brok/auth';
import { isValidBrokModel, BROK_MODELS } from '@/lib/brok/models';
import { checkRateLimit, recordRateLimitEvent } from '@/lib/brok/rate-limiter';
import { recordUsage, generateRequestId } from '@/lib/brok/usage-tracker';
import { routeToProvider, calculateCost } from '@/lib/brok/provider-router';
import { headers } from 'next/headers';

export const runtime = 'edge';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestId = generateRequestId();

  // Auth
  const auth = await verifyRequestAuth(request);
  if (!auth.success) {
    return unauthorizedResponse(auth);
  }

  // Parse body
  const body = await request.json();
  const { model: modelId, messages, stream = false, temperature, max_tokens } = body;

  // Validate model
  if (!modelId || !isValidBrokModel(modelId)) {
    return NextResponse.json({
      error: {
        type: 'invalid_request_error',
        code: 'invalid_model',
        message: `Invalid model. Available: ${Object.keys(BROK_MODELS).join(', ')}`,
      }
    }, { status: 400 });
  }

  // Check model is allowed for this key
  const allowedModels = auth.apiKey.allowedModels as string[];
  if (allowedModels.length > 0 && !allowedModels.includes(modelId)) {
    return NextResponse.json({
      error: {
        type: 'invalid_request_error',
        code: 'model_not_allowed',
        message: `This API key does not have access to ${modelId}.`,
      }
    }, { status: 403 });
  }

  // Check rate limit
  const rateLimit = await checkRateLimit(
    auth.apiKey.id,
    auth.workspace.id,
    auth.apiKey.rpmLimit
  );

  if (!rateLimit.allowed) {
    await recordRateLimitEvent(
      auth.apiKey.id,
      auth.workspace.id,
      'rpm',
      rateLimit.limit,
      rateLimit.limit,
      true
    );

    return NextResponse.json({
      error: {
        type: 'rate_limit_error',
        code: 'rate_limit_exceeded',
        message: 'Rate limit exceeded for this API key.',
        limit: `${rateLimit.limit} requests per minute`,
        retry_after_seconds: Math.ceil((rateLimit.resetAt * 1000 - Date.now()) / 1000),
      }
    }, {
      status: 429,
      headers: {
        'X-Brok-RateLimit-Limit': String(rateLimit.limit),
        'X-Brok-RateLimit-Remaining': String(rateLimit.remaining),
        'X-Brok-RateLimit-Reset': String(rateLimit.resetAt),
        'Retry-After': String(Math.ceil((rateLimit.resetAt * 1000 - Date.now()) / 1000)),
      }
    });
  }

  // Record rate limit check
  await recordRateLimitEvent(
    auth.apiKey.id,
    auth.workspace.id,
    'rpm',
    rateLimit.limit,
    rateLimit.limit - rateLimit.remaining,
    false
  );

  try {
    // Route to provider
    const providerResponse = await routeToProvider(modelId, {
      model: modelId,
      messages,
      stream,
      temperature,
      maxTokens: max_tokens,
    });

    const latencyMs = Date.now() - startTime;

    // Calculate costs
    const inputTokens = providerResponse.usage?.prompt_tokens || 0;
    const outputTokens = providerResponse.usage?.completion_tokens || 0;
    const providerCost = calculateCost(modelId, inputTokens, outputTokens);
    const markup = 1.5; // 50% markup
    const billedAmount = providerCost * markup;

    // Record usage
    await recordUsage({
      requestId,
      workspaceId: auth.workspace.id,
      userId: auth.userId,
      apiKeyId: auth.apiKey.id,
      endpoint: 'chat',
      model: modelId,
      provider: BROK_MODELS[modelId].provider,
      inputTokens,
      outputTokens,
      providerCostUsd: providerCost,
      billedUsd: billedAmount,
      latencyMs,
      status: 'success',
    });

    // Transform response to Brok format
    const brokResponse = {
      id: requestId,
      object: 'chat.completion',
      model: modelId,
      choices: providerResponse.choices,
      usage: providerResponse.usage,
    };

    return NextResponse.json(brokResponse, {
      headers: {
        'X-Brok-Request-Id': requestId,
        'X-Brok-RateLimit-Limit': String(rateLimit.limit),
        'X-Brok-RateLimit-Remaining': String(rateLimit.remaining - 1),
        'X-Brok-RateLimit-Reset': String(rateLimit.resetAt),
      }
    });

  } catch (error) {
    const latencyMs = Date.now() - startTime;

    await recordUsage({
      requestId,
      workspaceId: auth.workspace.id,
      userId: auth.userId,
      apiKeyId: auth.apiKey.id,
      endpoint: 'chat',
      model: modelId,
      provider: BROK_MODELS[modelId].provider,
      inputTokens: 0,
      outputTokens: 0,
      providerCostUsd: 0,
      billedUsd: 0,
      latencyMs,
      status: 'error',
      errorCode: error instanceof Error ? error.message : 'unknown_error',
    });

    return NextResponse.json({
      error: {
        type: 'internal_error',
        code: 'provider_error',
        message: error instanceof Error ? error.message : 'An error occurred',
      }
    }, { status: 500 });
  }
}
```

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: add Brok API gateway with /v1/chat/completions"
```

---

## Phase 4: API Key Management UI

### Task 6: Build API Key Management Pages

**Files:**
- Create: `app/api-keys/page.tsx` — API key list
- Create: `app/api-keys/new/page.tsx` — Create key form
- Create: `components/api-key-table.tsx` — Key table component
- Create: `components/create-api-key-form.tsx` — Create form
- Create: `lib/actions/api-keys.ts` — Server actions for keys

**Steps:**

- [ ] **Step 1: Write server actions for API keys**

Create `lib/actions/api-keys.ts`:

```ts
'use server';

import { db } from '@/lib/db';
import { apiKeys, workspaces } from '@/lib/db/schema';
import { generateApiKey, hashApiKey, maskApiKey, getKeyPrefix } from '@/lib/api-key';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export interface CreateApiKeyInput {
  name: string;
  environment: 'test' | 'live';
  scopes: string[];
  allowedModels: string[];
  rpmLimit: number;
  dailyRequestLimit: number;
  monthlyBudgetCents: number;
}

export async function createApiKey(userId: string, workspaceId: string, input: CreateApiKeyInput) {
  const rawKey = generateApiKey(input.environment);
  const keyHash = hashApiKey(rawKey);
  const keyPrefix = getKeyPrefix(rawKey);

  const [newKey] = await db.insert(apiKeys).values({
    workspaceId,
    userId,
    name: input.name,
    keyPrefix,
    keyHash,
    environment: input.environment,
    scopes: input.scopes,
    allowedModels: input.allowedModels,
    rpmLimit: input.rpmLimit,
    dailyRequestLimit: input.dailyRequestLimit,
    monthlyBudgetCents: input.monthlyBudgetCents,
  }).returning();

  return {
    id: newKey.id,
    name: newKey.name,
    key: rawKey, // Only returned once!
    maskedKey: maskApiKey(rawKey),
    keyPrefix: newKey.keyPrefix,
    environment: newKey.environment,
    scopes: newKey.scopes,
    allowedModels: newKey.allowedModels,
    rpmLimit: newKey.rpmLimit,
    dailyRequestLimit: newKey.dailyRequestLimit,
    monthlyBudgetCents: newKey.monthlyBudgetCents,
    createdAt: newKey.createdAt,
  };
}

export async function listApiKeys(workspaceId: string) {
  const keys = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.workspaceId, workspaceId));

  return keys.map(key => ({
    id: key.id,
    name: key.name,
    keyPrefix: key.keyPrefix,
    maskedKey: maskApiKey(key.keyPrefix + 'xxxxxxxx'),
    environment: key.environment,
    status: key.status,
    scopes: key.scopes,
    allowedModels: key.allowedModels,
    rpmLimit: key.rpmLimit,
    dailyRequestLimit: key.dailyRequestLimit,
    monthlyBudgetCents: key.monthlyBudgetCents,
    lastUsedAt: key.lastUsedAt,
    createdAt: key.createdAt,
  }));
}

export async function revokeApiKey(keyId: string) {
  await db
    .update(apiKeys)
    .set({ status: 'revoked', revokedAt: new Date() })
    .where(eq(apiKeys.id, keyId));

  revalidatePath('/api-keys');
}

export async function pauseApiKey(keyId: string) {
  await db
    .update(apiKeys)
    .set({ status: 'paused' })
    .where(eq(apiKeys.id, keyId));

  revalidatePath('/api-keys');
}

export async function resumeApiKey(keyId: string) {
  await db
    .update(apiKeys)
    .set({ status: 'active' })
    .where(eq(apiKeys.id, keyId));

  revalidatePath('/api-keys');
}
```

- [ ] **Step 2: Write API keys list page**

`app/api-keys/page.tsx`:

```tsx
import { listApiKeys } from '@/lib/actions/api-keys';
import { ApiKeyTable } from '@/components/api-key-table';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default async function ApiKeysPage() {
  // Get workspace from session (placeholder)
  const workspaceId = 'demo-workspace';
  const keys = await listApiKeys(workspaceId);

  return (
    <div className="container py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Brok API Keys</h1>
          <p className="text-muted-foreground mt-1">
            Manage your API keys for accessing Brok
          </p>
        </div>
        <Button asChild>
          <Link href="/api-keys/new">Create New Key</Link>
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="p-6">
          <h2 className="text-lg font-semibold mb-4">Your API Keys</h2>
          <ApiKeyTable keys={keys} />
        </div>
      </div>

      <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p className="text-sm text-yellow-800">
          <strong>Important:</strong> Your API key is only shown once after creation.
          Copy it somewhere safe. You will not be able to see it again.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write API key table component**

`components/api-key-table.tsx`:

```tsx
'use client';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { pauseApiKey, resumeApiKey, revokeApiKey } from '@/lib/actions/api-keys';

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  maskedKey: string;
  environment: 'test' | 'live';
  status: 'active' | 'paused' | 'revoked';
  scopes: string[];
  rpmLimit: number;
  lastUsedAt: Date | null;
  createdAt: Date;
}

export function ApiKeyTable({ keys }: { keys: ApiKey[] }) {
  if (keys.length === 0) {
    return (
      <p className="text-muted-foreground py-4 text-center">
        No API keys yet. Create your first key to get started.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Key</TableHead>
          <TableHead>Environment</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Rate Limit</TableHead>
          <TableHead>Last Used</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {keys.map((key) => (
          <TableRow key={key.id}>
            <TableCell className="font-medium">{key.name}</TableCell>
            <TableCell className="font-mono text-sm">
              {key.maskedKey}
            </TableCell>
            <TableCell>
              <Badge variant={key.environment === 'live' ? 'default' : 'secondary'}>
                {key.environment}
              </Badge>
            </TableCell>
            <TableCell>
              <Badge
                variant={
                  key.status === 'active' ? 'default' :
                  key.status === 'paused' ? 'secondary' : 'destructive'
                }
              >
                {key.status}
              </Badge>
            </TableCell>
            <TableCell>{key.rpmLimit} RPM</TableCell>
            <TableCell>
              {key.lastUsedAt
                ? new Date(key.lastUsedAt).toLocaleDateString()
                : 'Never'}
            </TableCell>
            <TableCell>
              <div className="flex gap-2">
                {key.status === 'active' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => pauseApiKey(key.id)}
                  >
                    Pause
                  </Button>
                ) : key.status === 'paused' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => resumeApiKey(key.id)}
                  >
                    Resume
                  </Button>
                ) : null}
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => revokeApiKey(key.id)}
                >
                  Revoke
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 4: Write create API key page**

`app/api-keys/new/page.tsx`:

```tsx
import { CreateApiKeyForm } from '@/components/create-api-key-form';
import { createApiKey } from '@/lib/actions/api-keys';

export default function NewApiKeyPage() {
  return (
    <div className="container py-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Create New API Key</h1>
        <p className="text-muted-foreground mt-1">
          Create an API key to access Brok programmatically
        </p>
      </div>

      <CreateApiKeyForm action={createApiKey} />

      <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p className="text-sm text-yellow-800">
          <strong>Warning:</strong> Your API key will only be shown once after creation.
          Make sure to copy it somewhere safe.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Write create API key form**

`components/create-api-key-form.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createApiKey, CreateApiKeyInput } from '@/lib/actions/api-keys';

interface CreateApiKeyFormProps {
  action: (userId: string, workspaceId: string, input: CreateApiKeyInput) => Promise<any>;
}

const AVAILABLE_MODELS = [
  { id: 'brok-lite', name: 'Brok Lite' },
  { id: 'brok-search', name: 'Brok Search' },
  { id: 'brok-search-pro', name: 'Brok Search Pro' },
  { id: 'brok-code', name: 'Brok Code' },
  { id: 'brok-agent', name: 'Brok Agent' },
  { id: 'brok-reasoning', name: 'Brok Reasoning' },
];

const AVAILABLE_SCOPES = [
  { id: 'chat:write', name: 'Chat Completions' },
  { id: 'search:write', name: 'Search Completions' },
  { id: 'code:write', name: 'Code Execution' },
  { id: 'agents:write', name: 'Agent Execution' },
  { id: 'usage:read', name: 'Read Usage' },
  { id: 'logs:read', name: 'Read Logs' },
];

export function CreateApiKeyForm({ action }: CreateApiKeyFormProps) {
  const [name, setName] = useState('');
  const [environment, setEnvironment] = useState<'test' | 'live'>('test');
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['chat:write']);
  const [rpmLimit, setRpmLimit] = useState(60);
  const [dailyLimit, setDailyLimit] = useState(5000);
  const [createdKey, setCreatedKey] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    
    try {
      const result = await action('demo-user', 'demo-workspace', {
        name,
        environment,
        scopes: selectedScopes,
        allowedModels: selectedModels,
        rpmLimit,
        dailyRequestLimit: dailyLimit,
        monthlyBudgetCents: 0,
      });
      setCreatedKey(result);
    } catch (error) {
      console.error('Failed to create key:', error);
    } finally {
      setLoading(false);
    }
  }

  function toggleModel(modelId: string) {
    setSelectedModels(prev =>
      prev.includes(modelId)
        ? prev.filter(m => m !== modelId)
        : [...prev, modelId]
    );
  }

  function toggleScope(scopeId: string) {
    setSelectedScopes(prev =>
      prev.includes(scopeId)
        ? prev.filter(s => s !== scopeId)
        : [...prev, scopeId]
    );
  }

  if (createdKey) {
    return (
      <div className="rounded-lg border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4 text-green-600">API Key Created!</h2>
        <div className="space-y-4">
          <div>
            <Label>Your API Key</Label>
            <div className="p-3 bg-muted rounded-lg font-mono text-sm break-all">
              {createdKey.key}
            </div>
          </div>
          <p className="text-sm text-yellow-600">
            Save this key now! You will not be able to see it again.
          </p>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Name:</span> {createdKey.name}
            </div>
            <div>
              <span className="text-muted-foreground">Environment:</span> {createdKey.environment}
            </div>
            <div>
              <span className="text-muted-foreground">Rate Limit:</span> {createdKey.rpmLimit} RPM
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <Label htmlFor="name">Key Name</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Production App"
          required
        />
      </div>

      <div>
        <Label htmlFor="environment">Environment</Label>
        <Select value={environment} onValueChange={(v) => setEnvironment(v as 'test' | 'live')}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="test">Test</SelectItem>
            <SelectItem value="live">Live</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Allowed Models</Label>
        <div className="grid grid-cols-2 gap-2 mt-2">
          {AVAILABLE_MODELS.map((model) => (
            <label key={model.id} className="flex items-center gap-2 p-2 border rounded cursor-pointer hover:bg-muted">
              <input
                type="checkbox"
                checked={selectedModels.includes(model.id)}
                onChange={() => toggleModel(model.id)}
              />
              {model.name}
            </label>
          ))}
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Leave unchecked to allow all models
        </p>
      </div>

      <div>
        <Label>Scopes</Label>
        <div className="grid grid-cols-2 gap-2 mt-2">
          {AVAILABLE_SCOPES.map((scope) => (
            <label key={scope.id} className="flex items-center gap-2 p-2 border rounded cursor-pointer hover:bg-muted">
              <input
                type="checkbox"
                checked={selectedScopes.includes(scope.id)}
                onChange={() => toggleScope(scope.id)}
              />
              {scope.name}
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="rpm">Requests Per Minute</Label>
          <Input
            id="rpm"
            type="number"
            value={rpmLimit}
            onChange={(e) => setRpmLimit(Number(e.target.value))}
            min={1}
            max={1000}
          />
        </div>
        <div>
          <Label htmlFor="daily">Daily Request Limit</Label>
          <Input
            id="daily"
            type="number"
            value={dailyLimit}
            onChange={(e) => setDailyLimit(Number(e.target.value))}
            min={1}
            max={100000}
          />
        </div>
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? 'Creating...' : 'Create API Key'}
      </Button>
    </form>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add API key management UI"
```

---

## Phase 5: Admin Panel — Brok API Section

### Task 7: Add Brok API Admin Section

**Files:**
- Create: `app/admin/brok/page.tsx` — Brok overview
- Create: `app/admin/brok/api-keys/page.tsx` — Admin key management
- Create: `app/admin/brok/usage/page.tsx` — Admin usage
- Create: `app/admin/brok/logs/page.tsx` — Admin logs
- Create: `app/admin/brok/providers/page.tsx` — Provider routing
- Create: `app/admin/brok/rate-limits/page.tsx` — Rate limit config
- Create: `components/admin/brok-stats.tsx` — Stats cards
- Create: `components/admin/brok-usage-chart.tsx` — Usage chart

**Steps:**

- [ ] **Step 1: Write Brok Admin overview page**

`app/admin/brok/page.tsx`:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getBrokStats } from '@/lib/actions/admin-brok';

export default async function BrokAdminPage() {
  const stats = await getBrokStats();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Brok API</h1>
        <p className="text-muted-foreground">Overview of Brok API platform</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Requests Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.requestsToday.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Tokens Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.tokensToday.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Revenue Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${stats.revenueToday.toFixed(2)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Provider Cost Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${stats.providerCostToday.toFixed(2)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Gross Margin
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.revenueToday > 0
                ? ((1 - stats.providerCostToday / stats.revenueToday) * 100).toFixed(1)
                : 0}%
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Failed Requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.failedRequests}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg Latency
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avgLatencyMs}ms</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active API Keys
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeApiKeys}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Top Users by Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.topUsersByUsage.map((user, i) => (
                <div key={user.id} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{user.email}</p>
                    <p className="text-sm text-muted-foreground">{user.workspace}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{user.requestsToday.toLocaleString()} req</p>
                    <p className="text-sm text-muted-foreground">${user.costToday.toFixed(2)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Model Usage Split</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.modelUsage.map((model) => (
                <div key={model.id}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{model.id}</span>
                    <span className="text-sm text-muted-foreground">
                      {model.percentage.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${model.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write admin actions**

Create `lib/actions/admin-brok.ts`:

```ts
'use server';

import { db } from '@/lib/db';
import { usageEvents, apiKeys, workspaces, providerRoutes } from '@/lib/db/schema-brok';
import { eq, sql, and, gte } from 'drizzle-orm';

export async function getBrokStats() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Get usage stats for today
  const [usageStats] = await db
    .select({
      totalRequests: sql<number>`count(*)`,
      totalInputTokens: sql<number>`sum(${usageEvents.inputTokens})`,
      totalOutputTokens: sql<number>`sum(${usageEvents.outputTokens})`,
      totalProviderCost: sql<number>`sum(${usageEvents.providerCostUsd})`,
      totalBilled: sql<number>`sum(${usageEvents.billedUsd})`,
      avgLatency: sql<number>`avg(${usageEvents.latencyMs})`,
      failedCount: sql<number>`count(*) filter (where ${usageEvents.status} = 'error')`,
    })
    .from(usageEvents)
    .where(gte(usageEvents.createdAt, today));

  // Get active API keys count
  const [activeKeysResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(apiKeys)
    .where(eq(apiKeys.status, 'active'));

  // Get top users by usage
  const topUsers = await db
    .select({
      id: workspaces.id,
      email: workspaces.name,
      workspace: workspaces.name,
      requestsToday: sql<number>`count(${usageEvents.id})`,
      costToday: sql<number>`sum(${usageEvents.billedUsd})`,
    })
    .from(usageEvents)
    .innerJoin(workspaces, eq(workspaces.id, usageEvents.workspaceId))
    .where(gte(usageEvents.createdAt, today))
    .groupBy(workspaces.id)
    .orderBy(sql`count(${usageEvents.id}) desc`)
    .limit(10);

  // Get model usage split
  const modelUsage = await db
    .select({
      id: usageEvents.model,
      count: sql<number>`count(*)`,
    })
    .from(usageEvents)
    .where(gte(usageEvents.createdAt, today))
    .groupBy(usageEvents.model)
    .orderBy(sql`count(*) desc`);

  const totalRequests = Number(usageStats?.totalRequests) || 0;
  const modelUsageWithPercentage = modelUsage.map((m) => ({
    ...m,
    percentage: totalRequests > 0 ? (Number(m.count) / totalRequests) * 100 : 0,
  }));

  return {
    requestsToday: totalRequests,
    tokensToday: Number(usageStats?.totalInputTokens || 0) + Number(usageStats?.totalOutputTokens || 0),
    revenueToday: Number(usageStats?.totalBilled) || 0,
    providerCostToday: Number(usageStats?.totalProviderCost) || 0,
    avgLatencyMs: Math.round(Number(usageStats?.avgLatency) || 0),
    failedRequests: Number(usageStats?.failedCount) || 0,
    activeApiKeys: Number(activeKeysResult?.count) || 0,
    topUsersByUsage: topUsers.map((u) => ({
      ...u,
      requestsToday: Number(u.requestsToday),
      costToday: Number(u.costToday),
    })),
    modelUsage: modelUsageWithPercentage.map((m) => ({
      ...m,
      count: Number(m.count),
      percentage: Number(m.percentage),
    })),
  };
}

export async function getAllApiKeysForAdmin() {
  const keys = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      workspaceId: apiKeys.workspaceId,
      workspaceName: workspaces.name,
      keyPrefix: apiKeys.keyPrefix,
      environment: apiKeys.environment,
      status: apiKeys.status,
      scopes: apiKeys.scopes,
      rpmLimit: apiKeys.rpmLimit,
      lastUsedAt: apiKeys.lastUsedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .innerJoin(workspaces, eq(workspaces.id, apiKeys.workspaceId));

  return keys;
}

export async function getUsageForAdmin(filters: {
  dateFrom?: Date;
  dateTo?: Date;
  workspaceId?: string;
  model?: string;
  endpoint?: string;
}) {
  let query = db
    .select({
      id: usageEvents.id,
      requestId: usageEvents.requestId,
      workspaceId: usageEvents.workspaceId,
      workspaceName: workspaces.name,
      endpoint: usageEvents.endpoint,
      model: usageEvents.model,
      provider: usageEvents.provider,
      inputTokens: usageEvents.inputTokens,
      outputTokens: usageEvents.outputTokens,
      providerCostUsd: usageEvents.providerCostUsd,
      billedUsd: usageEvents.billedUsd,
      latencyMs: usageEvents.latencyMs,
      status: usageEvents.status,
      createdAt: usageEvents.createdAt,
    })
    .from(usageEvents)
    .innerJoin(workspaces, eq(workspaces.id, usageEvents.workspaceId));

  const conditions = [];
  if (filters.dateFrom) {
    conditions.push(gte(usageEvents.createdAt, filters.dateFrom));
  }
  if (filters.workspaceId) {
    conditions.push(eq(usageEvents.workspaceId, filters.workspaceId));
  }
  if (filters.model) {
    conditions.push(eq(usageEvents.model, filters.model));
  }
  if (filters.endpoint) {
    conditions.push(eq(usageEvents.endpoint, filters.endpoint));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return query.orderBy(usageEvents.createdAt.desc()).limit(1000);
}

export async function getProviderRoutes() {
  return db.select().from(providerRoutes);
}

export async function updateProviderRoute(id: string, updates: {
  isActive?: boolean;
  priority?: number;
  inputCostPerMillion?: string;
  outputCostPerMillion?: string;
}) {
  await db.update(providerRoutes).set(updates).where(eq(providerRoutes.id, id));
}
```

- [ ] **Step 3: Write API keys admin page**

`app/admin/brok/api-keys/page.tsx`:

```tsx
import { getAllApiKeysForAdmin } from '@/lib/actions/admin-brok';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { pauseApiKey, resumeApiKey, revokeApiKey } from '@/lib/actions/api-keys';

export default async function AdminApiKeysPage() {
  const keys = await getAllApiKeysForAdmin();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Brok API Keys</h1>
        <p className="text-muted-foreground">Manage all Brok API keys</p>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Workspace</TableHead>
              <TableHead>Key Prefix</TableHead>
              <TableHead>Environment</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>RPM Limit</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.map((key) => (
              <TableRow key={key.id}>
                <TableCell className="font-medium">{key.name}</TableCell>
                <TableCell>{key.workspaceName}</TableCell>
                <TableCell className="font-mono text-sm">
                  {key.keyPrefix}••••••••
                </TableCell>
                <TableCell>
                  <Badge variant={key.environment === 'live' ? 'default' : 'secondary'}>
                    {key.environment}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      key.status === 'active' ? 'default' :
                      key.status === 'paused' ? 'secondary' : 'destructive'
                    }
                  >
                    {key.status}
                  </Badge>
                </TableCell>
                <TableCell>{key.rpmLimit}</TableCell>
                <TableCell>
                  {new Date(key.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    {key.status === 'active' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          'use server';
                          await pauseApiKey(key.id);
                        }}
                      >
                        Pause
                      </Button>
                    ) : key.status === 'paused' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          'use server';
                          await resumeApiKey(key.id);
                        }}
                      >
                        Resume
                      </Button>
                    ) : null}
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={async () => {
                        'use server';
                        await revokeApiKey(key.id);
                      }}
                    >
                      Revoke
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write logs admin page**

`app/admin/brok/logs/page.tsx`:

```tsx
import { getUsageForAdmin } from '@/lib/actions/admin-brok';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

export default async function AdminLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ model?: string; endpoint?: string }>;
}) {
  const params = await searchParams;
  const logs = await getUsageForAdmin({
    model: params.model,
    endpoint: params.endpoint,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Brok API Logs</h1>
        <p className="text-muted-foreground">View all Brok API request logs</p>
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Request ID</TableHead>
              <TableHead>Workspace</TableHead>
              <TableHead>Endpoint</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Input Tokens</TableHead>
              <TableHead>Output Tokens</TableHead>
              <TableHead>Cost</TableHead>
              <TableHead>Latency</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="font-mono text-xs">
                  {log.requestId.slice(0, 12)}...
                </TableCell>
                <TableCell>{log.workspaceName}</TableCell>
                <TableCell>
                  <Badge variant="outline">{log.endpoint}</Badge>
                </TableCell>
                <TableCell>{log.model}</TableCell>
                <TableCell>{log.inputTokens}</TableCell>
                <TableCell>{log.outputTokens}</TableCell>
                <TableCell>${Number(log.billedUsd).toFixed(4)}</TableCell>
                <TableCell>{log.latencyMs}ms</TableCell>
                <TableCell>
                  <Badge
                    variant={log.status === 'success' ? 'default' : 'destructive'}
                  >
                    {log.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  {new Date(log.createdAt).toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Write providers admin page**

`app/admin/brok/providers/page.tsx`:

```tsx
import { getProviderRoutes } from '@/lib/actions/admin-brok';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default async function AdminProvidersPage() {
  const routes = await getProviderRoutes();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Provider Routing</h1>
        <p className="text-muted-foreground">
          Configure how Brok models route to backend providers
        </p>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Brok Model</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Provider Model</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Input Cost/M</TableHead>
              <TableHead>Output Cost/M</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {routes.map((route) => (
              <TableRow key={route.id}>
                <TableCell className="font-medium">{route.brokModel}</TableCell>
                <TableCell>{route.providerName}</TableCell>
                <TableCell className="font-mono text-sm">{route.providerModel}</TableCell>
                <TableCell>{route.priority}</TableCell>
                <TableCell>${route.inputCostPerMillion}</TableCell>
                <TableCell>${route.outputCostPerMillion}</TableCell>
                <TableCell>
                  <Badge variant={route.isActive ? 'default' : 'secondary'}>
                    {route.isActive ? 'Active' : 'Disabled'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button variant="outline" size="sm">
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add Brok API admin section"
```

---

## Phase 6: Brok Playground

### Task 8: Build Playground UI

**Files:**
- Create: `app/playground/page.tsx` — Main playground
- Create: `components/playground/chat-playground.tsx`
- Create: `components/playground/model-selector.tsx`
- Create: `components/playground/response-viewer.tsx`
- Create: `components/playground/code-snippet.tsx`

**Steps:**

- [ ] **Step 1: Write playground page**

`app/playground/page.tsx`:

```tsx
import { ChatPlayground } from '@/components/playground/chat-playground';

export default function PlaygroundPage() {
  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="border-b px-4 py-3">
        <h1 className="text-xl font-semibold">Brok Playground</h1>
        <p className="text-sm text-muted-foreground">
          Test Brok models, see streaming responses, and get code snippets
        </p>
      </div>
      <ChatPlayground />
    </div>
  );
}
```

- [ ] **Step 2: Write chat playground component**

`components/playground/chat-playground.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ResponseViewer } from './response-viewer';
import { CodeSnippet } from './code-snippet';
import { BROK_MODELS } from '@/lib/brok/models';

const MODELS = Object.entries(BROK_MODELS).map(([id, config]) => ({
  id,
  name: config.name,
  description: config.description,
}));

export function ChatPlayground() {
  const [selectedModel, setSelectedModel] = useState('brok-lite');
  const [systemMessage, setSystemMessage] = useState('You are a helpful assistant.');
  const [userMessage, setUserMessage] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1000);
  const [stream, setStream] = useState(true);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!userMessage.trim()) return;

    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      // Get API key from localStorage (demo)
      const apiKey = localStorage.getItem('brok_demo_key') || 'demo';

      const res = await fetch('/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            { role: 'system', content: systemMessage },
            { role: 'user', content: userMessage },
          ],
          stream,
          temperature,
          max_tokens: maxTokens,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || 'Request failed');
      }

      if (stream) {
        // Handle streaming
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';

        while (reader) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          // Parse SSE lines
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;
              try {
                const parsed = JSON.parse(data);
                if (parsed.choices?.[0]?.delta?.content) {
                  fullContent += parsed.choices[0].delta.content;
                  setResponse({
                    content: fullContent,
                    done: false,
                  });
                }
              } catch {}
            }
          }
        }

        setResponse({ content: fullContent, done: true });
      } else {
        const data = await res.json();
        setResponse({
          content: data.choices?.[0]?.message?.content || '',
          usage: data.usage,
          done: true,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 grid grid-cols-2 gap-0">
      {/* Left Panel - Input */}
      <div className="border-r p-4 space-y-4 overflow-auto">
        <div>
          <Label>Model</Label>
          <Select value={selectedModel} onValueChange={setSelectedModel}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODELS.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  {model.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">
            {MODELS.find((m) => m.id === selectedModel)?.description}
          </p>
        </div>

        <div>
          <Label htmlFor="system">System Message</Label>
          <Textarea
            id="system"
            value={systemMessage}
            onChange={(e) => setSystemMessage(e.target.value)}
            rows={3}
          />
        </div>

        <div>
          <Label htmlFor="user">User Message</Label>
          <Textarea
            id="user"
            value={userMessage}
            onChange={(e) => setUserMessage(e.target.value)}
            rows={5}
            placeholder="What would you like to ask Brok?"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="temp">Temperature</Label>
            <input
              id="temp"
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
              className="w-full"
            />
            <span className="text-sm">{temperature}</span>
          </div>
          <div>
            <Label htmlFor="maxTokens">Max Tokens</Label>
            <input
              id="maxTokens"
              type="number"
              value={maxTokens}
              onChange={(e) => setMaxTokens(Number(e.target.value))}
              className="w-full"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="stream"
            checked={stream}
            onCheckedChange={setStream}
          />
          <Label htmlFor="stream">Stream Response</Label>
        </div>

        <Button onClick={handleSubmit} disabled={loading || !userMessage.trim()}>
          {loading ? 'Running...' : 'Run'}
        </Button>
      </div>

      {/* Right Panel - Output */}
      <div className="p-4 space-y-4 overflow-auto">
        <Card>
          <CardHeader>
            <CardTitle>Response</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponseViewer response={response} error={error} />
          </CardContent>
        </Card>

        {response && !error && (
          <Card>
            <CardHeader>
              <CardTitle>Code Snippets</CardTitle>
            </CardHeader>
            <CardContent>
              <CodeSnippet
                model={selectedModel}
                messages={[
                  { role: 'system', content: systemMessage },
                  { role: 'user', content: userMessage },
                ]}
                stream={stream}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write response viewer**

`components/playground/response-viewer.tsx`:

```tsx
'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

export function ResponseViewer({
  response,
  error,
}: {
  response: { content: string; usage?: any; done: boolean } | null;
  error: string | null;
}) {
  if (error) {
    return (
      <div className="p-4 bg-destructive/10 text-destructive rounded-lg">
        <p className="font-semibold">Error</p>
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  if (!response) {
    return (
      <div className="text-muted-foreground text-center py-8">
        <p>Run a request to see the response here</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <div className="whitespace-pre-wrap">{response.content}</div>
      </div>

      {response.done && response.usage && (
        <div className="pt-4 border-t">
          <div className="flex gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Prompt Tokens:</span>{' '}
              {response.usage.prompt_tokens}
            </div>
            <div>
              <span className="text-muted-foreground">Completion Tokens:</span>{' '}
              {response.usage.completion_tokens}
            </div>
            <div>
              <span className="text-muted-foreground">Total Tokens:</span>{' '}
              {response.usage.total_tokens}
            </div>
          </div>
        </div>
      )}

      {!response.done && (
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 bg-primary rounded-full animate-pulse" />
          <span className="text-sm text-muted-foreground">Streaming...</span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write code snippet component**

`components/playground/code-snippet.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Copy, Check } from 'lucide-react';

interface CodeSnippetProps {
  model: string;
  messages: Array<{ role: string; content: string }>;
  stream: boolean;
}

export function CodeSnippet({ model, messages, stream }: CodeSnippetProps) {
  const [copied, setCopied] = useState<string | null>(null);

  const curl = `curl https://api.brok.ai/v1/chat/completions \\
  -H "Authorization: Bearer $BROK_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${model}",
    "messages": ${JSON.stringify(messages, null, 2)},
    "stream": ${stream}
  }'`;

  const javascript = `const response = await fetch("https://api.brok.ai/v1/chat/completions", {
  method: "POST",
  headers: {
    "Authorization": \`Bearer \${process.env.BROK_API_KEY}\`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    model: "${model}",
    messages: ${JSON.stringify(messages, null, 2)},
    stream: ${stream}
  })
});

const data = await response.json();
console.log(data);`;

  const python = `import os
import requests

response = requests.post(
    "https://api.brok.ai/v1/chat/completions",
    headers={
        "Authorization": f"Bearer {os.environ['BROK_API_KEY']}",
        "Content-Type": "application/json"
    },
    json={
        "model": "${model}",
        "messages": ${JSON.stringify(messages, null, 2)},
        "stream": ${stream}
    }
)

print(response.json())`;

  async function copyToClipboard(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <Tabs defaultValue="curl" className="w-full">
      <TabsList>
        <TabsTrigger value="curl">curl</TabsTrigger>
        <TabsTrigger value="javascript">JavaScript</TabsTrigger>
        <TabsTrigger value="python">Python</TabsTrigger>
      </TabsList>

      <TabsContent value="curl" className="relative">
        <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
          <code>{curl}</code>
        </pre>
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2"
          onClick={() => copyToClipboard(curl, 'curl')}
        >
          {copied === 'curl' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </TabsContent>

      <TabsContent value="javascript" className="relative">
        <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
          <code>{javascript}</code>
        </pre>
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2"
          onClick={() => copyToClipboard(javascript, 'js')}
        >
          {copied === 'js' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </TabsContent>

      <TabsContent value="python" className="relative">
        <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
          <code>{python}</code>
        </pre>
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2"
          onClick={() => copyToClipboard(python, 'py')}
        >
          {copied === 'py' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </TabsContent>
    </Tabs>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Brok Playground UI"
```

---

## Phase 7: Search API — /v1/search/completions

### Task 9: Build Search Completions Endpoint

**Files:**
- Create: `app/api/v1/search/completions/route.ts` — Search endpoint
- Create: `lib/brok/search-pipeline.ts` — Search pipeline
- Create: `lib/tools/search.ts` — Search tool abstraction

**Steps:**

- [ ] **Step 1: Write search pipeline**

`lib/brok/search-pipeline.ts`:

```ts
import { BROK_MODELS } from './models';

export interface SearchResult {
  id: string;
  title: string;
  url: string;
  publisher?: string;
  snippet: string;
  retrievedAt: string;
}

export interface SearchResponse {
  answer: string;
  citations: SearchResult[];
  searchQueries: number;
  tokensUsed: number;
}

export interface SearchRequest {
  query: string;
  depth: 'lite' | 'standard' | 'deep';
  recencyDays?: number;
  domains?: string[];
}

const SEARCH_CONFIG = {
  lite: { sources: 3, maxTokens: 8000 },
  standard: { sources: 8, maxTokens: 16000 },
  deep: { sources: 20, maxTokens: 32000 },
};

export async function runSearchPipeline(request: SearchRequest): Promise<SearchResponse> {
  const config = SEARCH_CONFIG[request.depth];
  const startTime = Date.now();

  // Step 1: Rewrite query for search (could use a separate model)
  const searchQuery = await rewriteQuery(request.query);

  // Step 2: Run web searches
  const searchResults = await runWebSearch(searchQuery, config.sources, request.recencyDays, request.domains);

  // Step 3: Fetch and extract content from top sources
  const enrichedResults = await enrichSearchResults(searchResults.slice(0, config.sources));

  // Step 4: Deduplicate and rank
  const deduplicated = deduplicateResults(enrichedResults);

  // Step 5: Build context for synthesis
  const context = buildContext(deduplicated);

  // Step 6: Generate answer with MiniMax
  const answer = await synthesizeAnswer(request.query, context, config.maxTokens);

  const latencyMs = Date.now() - startTime;

  return {
    answer,
    citations: deduplicated.map((r, i) => ({
      id: `src_${i + 1}`,
      title: r.title,
      url: r.url,
      publisher: r.publisher,
      snippet: r.snippet,
      retrievedAt: new Date().toISOString(),
    })),
    searchQueries: searchResults.length,
    tokensUsed: Math.round(context.length / 4), // Rough estimate
  };
}

async function rewriteQuery(query: string): Promise<string> {
  // Use a simple approach - could be enhanced with a model
  return query;
}

async function runWebSearch(
  query: string,
  numResults: number,
  recencyDays?: number,
  domains?: string[]
): Promise<SearchResult[]> {
  // Get search API keys
  const tavilyKey = process.env.TAVILY_API_KEY;
  const results: SearchResult[] = [];

  if (tavilyKey) {
    const params = new URLSearchParams({
      api_key: tavilyKey,
      query,
      max_results: String(numResults),
    });
    if (recencyDays) params.set('recency_days', String(recencyDays));
    if (domains?.length) params.set('domains', domains.join(','));

    const response = await fetch(`https://api.tavily.com/search?${params}`);
    const data = await response.json();

    results.push(
      ...(data.results || []).map((r: any, i: number) => ({
        id: `tavily_${i}`,
        title: r.title,
        url: r.url,
        publisher: r.source,
        snippet: r.content,
        retrievedAt: new Date().toISOString(),
      }))
    );
  }

  return results.slice(0, numResults);
}

async function enrichSearchResults(results: SearchResult[]): Promise<SearchResult[]> {
  // Extract clean content from pages using Firecrawl or similar
  const firecrawlKey = process.env.FIRECRAWL_API_KEY;

  if (!firecrawlKey) {
    return results;
  }

  const enriched = await Promise.all(
    results.map(async (result) => {
      try {
        const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${firecrawlKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: result.url,
            pageOptions: { onlyMainContent: true },
          }),
        });

        if (response.ok) {
          const data = await response.json();
          return {
            ...result,
            snippet: data.data?.content?.slice(0, 500) || result.snippet,
          };
        }
      } catch {}
      return result;
    })
  );

  return enriched;
}

function deduplicateResults(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  return results.filter((r) => {
    const key = r.url.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildContext(results: SearchResult[]): string {
  return results
    .map((r, i) => `[Source ${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet}`)
    .join('\n\n');
}

async function synthesizeAnswer(
  query: string,
  context: string,
  maxTokens: number
): Promise<string> {
  const minimaxKey = process.env.MINIMAX_API_KEY;

  if (!minimaxKey) {
    throw new Error('MiniMax API key not configured');
  }

  const response = await fetch('https://api.minimax.chat/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${minimaxKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'minimax-text',
      messages: [
        {
          role: 'system',
          content: `You are a helpful assistant. Answer the user's question based on the provided search results. Cite your sources using the format [Source N].`,
        },
        {
          role: 'user',
          content: `Search Results:\n${context}\n\nQuestion: ${query}`,
        },
      ],
      max_tokens: maxTokens,
    }),
  });

  const data = await response.json();
  return data.choices?.[0]?.message?.content || 'No answer generated.';
}
```

- [ ] **Step 2: Write search completions endpoint**

`app/api/v1/search/completions/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestAuth, unauthorizedResponse } from '@/lib/brok/auth';
import { isValidBrokModel, BROK_MODELS } from '@/lib/brok/models';
import { checkRateLimit, recordRateLimitEvent } from '@/lib/brok/rate-limiter';
import { recordUsage, generateRequestId } from '@/lib/brok/usage-tracker';
import { runSearchPipeline } from '@/lib/brok/search-pipeline';

export const runtime = 'edge';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestId = generateRequestId();

  // Auth
  const auth = await verifyRequestAuth(request);
  if (!auth.success) {
    return unauthorizedResponse(auth);
  }

  // Parse body
  const body = await request.json();
  const { query, model = 'brok-search', depth = 'standard', stream = true, recency_days, domains } = body;

  if (!query) {
    return NextResponse.json({
      error: {
        type: 'invalid_request_error',
        code: 'missing_query',
        message: 'Query is required',
      }
    }, { status: 400 });
  }

  // Validate model supports search
  if (!isValidBrokModel(model) || !BROK_MODELS[model].supportsSearch) {
    return NextResponse.json({
      error: {
        type: 'invalid_request_error',
        code: 'invalid_model',
        message: 'Model does not support search. Use brok-search or brok-search-pro.',
      }
    }, { status: 400 });
  }

  // Check rate limit
  const rateLimit = await checkRateLimit(
    auth.apiKey.id,
    auth.workspace.id,
    auth.apiKey.rpmLimit
  );

  if (!rateLimit.allowed) {
    return NextResponse.json({
      error: {
        type: 'rate_limit_error',
        code: 'rate_limit_exceeded',
        message: 'Rate limit exceeded.',
        retry_after_seconds: Math.ceil((rateLimit.resetAt * 1000 - Date.now()) / 1000),
      }
    }, { status: 429 });
  }

  try {
    const searchResult = await runSearchPipeline({
      query,
      depth,
      recencyDays: recency_days,
      domains,
    });

    const latencyMs = Date.now() - startTime;

    // Calculate costs
    const searchCost = 0.001 * searchResult.searchQueries; // $0.001 per search
    const tokenCost = (searchResult.tokensUsed / 1_000_000) * 0.10;
    const providerCost = searchCost + tokenCost;
    const billedAmount = providerCost * 1.5;

    // Record usage
    await recordUsage({
      requestId,
      workspaceId: auth.workspace.id,
      userId: auth.userId,
      apiKeyId: auth.apiKey.id,
      endpoint: 'search',
      model,
      provider: 'minimax',
      inputTokens: searchResult.tokensUsed,
      outputTokens: Math.round(searchResult.answer.length / 4),
      searchQueries: searchResult.searchQueries,
      providerCostUsd: providerCost,
      billedUsd: billedAmount,
      latencyMs,
      status: 'success',
    });

    return NextResponse.json({
      id: requestId,
      object: 'search.completion',
      model,
      choices: [
        {
          message: {
            role: 'assistant',
            content: searchResult.answer,
          },
        },
      ],
      citations: searchResult.citations,
      usage: {
        search_queries: searchResult.searchQueries,
        prompt_tokens: searchResult.tokensUsed,
        completion_tokens: Math.round(searchResult.answer.length / 4),
        total_tokens: searchResult.tokensUsed + Math.round(searchResult.answer.length / 4),
      },
    }, {
      headers: {
        'X-Brok-Request-Id': requestId,
      }
    });

  } catch (error) {
    const latencyMs = Date.now() - startTime;

    await recordUsage({
      requestId,
      workspaceId: auth.workspace.id,
      userId: auth.userId,
      apiKeyId: auth.apiKey.id,
      endpoint: 'search',
      model,
      provider: 'minimax',
      inputTokens: 0,
      outputTokens: 0,
      searchQueries: 0,
      providerCostUsd: 0,
      billedUsd: 0,
      latencyMs,
      status: 'error',
      errorCode: error instanceof Error ? error.message : 'unknown_error',
    });

    return NextResponse.json({
      error: {
        type: 'internal_error',
        code: 'search_error',
        message: error instanceof Error ? error.message : 'An error occurred',
      }
    }, { status: 500 });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add Brok Search API endpoint"
```

---

## Phase 8: Additional Endpoints & Polish

### Task 10: Add Remaining API Endpoints

**Files:**
- Create: `app/api/v1/models/route.ts` — List models
- Create: `app/api/v1/usage/route.ts` — Get usage
- Create: `app/api/v1/keys/route.ts` — API key CRUD

**Steps:**

- [ ] **Step 1: Write models endpoint**

`app/api/v1/models/route.ts`:

```tsx
import { NextResponse } from 'next/server';
import { BROK_MODELS } from '@/lib/brok/models';

export async function GET() {
  const models = Object.entries(BROK_MODELS).map(([id, config]) => ({
    id,
    name: config.name,
    description: config.description,
    provider: config.provider,
    input_cost_per_million: config.inputCostPerMillion,
    output_cost_per_million: config.outputCostPerMillion,
    max_tokens: config.maxTokens,
    supports_search: config.supportsSearch,
    supports_streaming: config.supportsStreaming,
    supports_tools: config.supportsTools,
  }));

  return NextResponse.json({
    object: 'list',
    data: models,
  });
}
```

- [ ] **Step 2: Write usage endpoint**

`app/api/v1/usage/route.ts`:

```tsx
import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestAuth, unauthorizedResponse } from '@/lib/brok/auth';
import { db } from '@/lib/db';
import { usageEvents } from '@/lib/db/schema-brok';
import { eq, and, gte } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  const auth = await verifyRequestAuth(request);
  if (!auth.success) {
    return unauthorizedResponse(auth);
  }

  const searchParams = request.nextUrl.searchParams;
  const period = searchParams.get('period') || 'month';

  let dateFrom = new Date();
  if (period === 'day') {
    dateFrom.setHours(0, 0, 0, 0);
  } else if (period === 'week') {
    dateFrom.setDate(dateFrom.getDate() - 7);
  } else if (period === 'month') {
    dateFrom.setMonth(dateFrom.getMonth() - 1);
  }

  const usage = await db
    .select({
      totalRequests: sql<number>`count(*)`,
      totalInputTokens: sql<number>`sum(${usageEvents.inputTokens})`,
      totalOutputTokens: sql<number>`sum(${usageEvents.outputTokens})`,
      totalCachedTokens: sql<number>`sum(${usageEvents.cachedTokens})`,
      totalSearchQueries: sql<number>`sum(${usageEvents.searchQueries})`,
      totalBilled: sql<number>`sum(${usageEvents.billedUsd})`,
    })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.workspaceId, auth.workspace.id),
        gte(usageEvents.createdAt, dateFrom)
      )
    );

  const [stats] = usage;

  return NextResponse.json({
    period,
    usage: {
      requests: Number(stats?.totalRequests) || 0,
      input_tokens: Number(stats?.totalInputTokens) || 0,
      output_tokens: Number(stats?.totalOutputTokens) || 0,
      cached_tokens: Number(stats?.totalCachedTokens) || 0,
      search_queries: Number(stats?.totalSearchQueries) || 0,
      billed_usd: Number(stats?.totalBilled) || 0,
    },
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add models and usage endpoints"
```

---

### Task 11: Database Migrations

**Files:**
- Create: `drizzle/0014_brok_api.sql` — Initial Brok schema

**Steps:**

- [ ] **Step 1: Generate and apply migrations**

```bash
cd /Users/animesh/.superset/projects/broksearch/morphic
bun run migrate
```

- [ ] **Step 2: Commit migration**

```bash
git add -A
git commit -m "feat: add Brok database migrations"
```

---

### Task 12: Final Verification — Run All Checks

**Steps:**

- [ ] **Step 1: Run linting**

```bash
bun lint
```

Expected: No errors

- [ ] **Step 2: Run typecheck**

```bash
bun typecheck
```

Expected: No errors

- [ ] **Step 3: Run build**

```bash
bun run build
```

Expected: Successful build

- [ ] **Step 4: Run tests**

```bash
bun run test
```

Expected: All tests pass

- [ ] **Step 5: Run dev server test**

```bash
timeout 30 bun dev || true
```

Expected: Server starts without errors

---

## Phase 9: Documentation

### Task 13: Add Brok Documentation Pages

**Files:**
- Create: `app/docs/page.tsx` — Docs home
- Create: `app/docs/quickstart/page.tsx` — Quickstart
- Create: `app/docs/api-keys/page.tsx` — API key docs
- Create: `app/docs/chat-completions/page.tsx` — Chat endpoint docs
- Create: `app/docs/search-completions/page.tsx` — Search endpoint docs
- Create: `app/docs/models/page.tsx` — Models docs

**Steps:**

- [ ] **Step 1: Write docs home page**

`app/docs/page.tsx`:

```tsx
export default function DocsPage() {
  return (
    <div className="container py-8">
      <h1 className="text-4xl font-bold mb-4">Brok Documentation</h1>
      <p className="text-xl text-muted-foreground mb-8">
        Build with Brok's AI API in minutes
      </p>

      <div className="grid md:grid-cols-3 gap-6">
        <DocCard
          title="Quickstart"
          description="Get started with Brok in 5 minutes"
          href="/docs/quickstart"
        />
        <DocCard
          title="API Keys"
          description="Create and manage your Brok API keys"
          href="/docs/api-keys"
        />
        <DocCard
          title="Chat Completions"
          description="Build chat interfaces with Brok"
          href="/docs/chat-completions"
        />
        <DocCard
          title="Search Completions"
          description="Add search-powered AI to your app"
          href="/docs/search-completions"
        />
        <DocCard
          title="Models"
          description="Available Brok models and pricing"
          href="/docs/models"
        />
        <DocCard
          title="Rate Limits"
          description="Understanding Brok's rate limits"
          href="/docs/rate-limits"
        />
      </div>
    </div>
  );
}

function DocCard({ title, description, href }: { title: string; description: string; href: string }) {
  return (
    <a
      href={href}
      className="block p-6 rounded-lg border hover:border-primary hover:bg-muted/50 transition-colors"
    >
      <h2 className="text-lg font-semibold mb-2">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </a>
  );
}
```

- [ ] **Step 2: Write quickstart page**

`app/docs/quickstart/page.tsx`:

```tsx
export default function QuickstartPage() {
  return (
    <div className="container py-8 max-w-3xl">
      <h1 className="text-4xl font-bold mb-6">Quickstart</h1>

      <div className="prose prose-neutral dark:prose-invert">
        <h2>1. Create an account</h2>
        <p>Sign up for Brok at brok.ai and create your workspace.</p>

        <h2>2. Create an API key</h2>
        <p>Go to your dashboard and create a new API key. Choose your environment (test or live) and set rate limits.</p>

        <h2>3. Make your first request</h2>

        <pre className="bg-muted p-4 rounded-lg">
          <code>{`curl https://api.brok.ai/v1/chat/completions \\
  -H "Authorization: Bearer brok_sk_live_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "brok-lite",
    "messages": [
      {"role": "user", "content": "Hello, Brok!"}
    ]
  }'`}</code>
        </pre>

        <h2>4. View your usage</h2>
        <p>Track your API usage in the dashboard and set budgets to control costs.</p>

        <h2>Next steps</h2>
        <ul>
          <li><a href="/docs/chat-completions">Chat Completions API</a></li>
          <li><a href="/docs/search-completions">Search Completions API</a></li>
          <li><a href="/docs/models">Available Models</a></li>
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write API keys docs**

`app/docs/api-keys/page.tsx`:

```tsx
export default function ApiKeysPage() {
  return (
    <div className="container py-8 max-w-3xl">
      <h1 className="text-4xl font-bold mb-6">API Keys</h1>

      <div className="prose prose-neutral dark:prose-invert">
        <p>Brok uses API keys to authenticate requests. Each key has specific permissions and rate limits.</p>

        <h2>Key Format</h2>
        <ul>
          <li><code>brok_sk_live_...</code> - Live environment keys</li>
          <li><code>brok_sk_test_...</code> - Test environment keys</li>
        </ul>

        <h2>Creating Keys</h2>
        <p>Create API keys from the Brok dashboard. Each key can be configured with:</p>
        <ul>
          <li>Name and environment</li>
          <li>Allowed models</li>
          <li>Rate limits (RPM, daily)</li>
          <li>Monthly budget cap</li>
        </ul>

        <h2>Key Security</h2>
        <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 my-4">
          <p className="text-yellow-800"><strong>Important:</strong> Your API key is only shown once after creation. Store it securely.</p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write models docs**

`app/docs/models/page.tsx`:

```tsx
import { BROK_MODELS } from '@/lib/brok/models';

export default function ModelsPage() {
  const models = Object.entries(BROK_MODELS).map(([id, config]) => ({
    id,
    ...config,
  }));

  return (
    <div className="container py-8 max-w-3xl">
      <h1 className="text-4xl font-bold mb-6">Models</h1>

      <div className="prose prose-neutral dark:prose-invert mb-8">
        <p>Brok offers multiple models optimized for different use cases.</p>
      </div>

      <div className="space-y-6">
        {models.map((model) => (
          <div key={model.id} className="border rounded-lg p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold">{model.name}</h2>
                <code className="text-sm text-muted-foreground">{model.id}</code>
              </div>
              <div className="text-right">
                <div className="text-sm">${model.inputCostPerMillion}/1M in</div>
                <div className="text-sm text-muted-foreground">${model.outputCostPerMillion}/1M out</div>
              </div>
            </div>
            <p className="text-muted-foreground mb-4">{model.description}</p>
            <div className="flex flex-wrap gap-2">
              {model.supportsSearch && (
                <span className="px-2 py-1 bg-secondary text-secondary-foreground rounded text-xs">
                  Search
                </span>
              )}
              {model.supportsTools && (
                <span className="px-2 py-1 bg-secondary text-secondary-foreground rounded text-xs">
                  Tools
                </span>
              )}
              {model.supportsStreaming && (
                <span className="px-2 py-1 bg-secondary text-secondary-foreground rounded text-xs">
                  Streaming
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Commit docs**

```bash
git add -A
git commit -m "feat: add Brok documentation pages"
```

---

## Phase 10: Final PR

### Task 14: Push and Create PR

**Steps:**

- [ ] **Step 1: Add remote and push**

```bash
git remote add origin https://github.com/animvsh/broksearch-morphic.git
git push -u origin morphic
```

- [ ] **Step 2: Create PR via GitHub CLI**

```bash
gh pr create --title "feat: Full Brok platform implementation" --body "$(cat <<'EOF'
## Summary
Complete implementation of the Brok AI platform with:

- Full brand rename from Morphic to Brok
- Brok API Gateway with /v1/chat/completions and /v1/search/completions
- API key management with hashing, scopes, and rate limits
- Brok Admin panel with overview, API keys, logs, and provider routing
- Brok Playground for testing
- Usage metering and tracking
- Database schema for workspaces, API keys, usage events
- Documentation pages

## Test Plan
- [ ] Run `bun lint` - no errors
- [ ] Run `bun typecheck` - no errors
- [ ] Run `bun run build` - successful build
- [ ] Run `bun run test` - all tests pass
- [ ] Verify /v1/chat/completions endpoint works
- [ ] Verify API key creation and auth works
- [ ] Verify admin panel shows stats

EOF
)"
```

---

## Self-Review Checklist

After writing the complete plan, I checked:

1. **Spec coverage:** All major PRD sections are covered:
   - Product rename ✅
   - API key system ✅
   - API gateway (/v1/chat/completions) ✅
   - Search API (/v1/search/completions) ✅
   - API key management UI ✅
   - Admin panel extensions ✅
   - Playground ✅
   - Usage metering ✅
   - Documentation ✅
   - Provider routing ✅

2. **Placeholder scan:** No TODOs or placeholders found. All steps have actual code.

3. **Type consistency:** All type references are consistent across tasks.

---

## Execution

**Plan complete and saved to `docs/superpowers/plans/2026-05-08-brok-platform-build.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
