import type { BrokBuildBackendResourcePlan } from '@/lib/build/types'
import { redactSensitiveData } from '@/lib/redaction'

export type InsForgeBackendApplyStep = {
  id: string
  label: string
  status: 'pending' | 'applied' | 'skipped' | 'failed'
  method?: string
  pathname?: string
  statusCode?: number | null
  message?: string
}

export type InsForgeBackendApplyResult = {
  provider: 'insforge'
  status: 'applied' | 'failed' | 'dry_run'
  dryRun: boolean
  appliedAt: string
  migrationVersion: string | null
  migrationName: string | null
  steps: InsForgeBackendApplyStep[]
}

type FetchLike = typeof fetch

type ApplyOptions = {
  projectUrl: string
  adminKey: string
  plan: BrokBuildBackendResourcePlan
  migrationNameSeed: string
  dryRun?: boolean
  now?: Date
  fetchImpl?: FetchLike
}

function buildProjectApiUrl(projectUrl: string, pathname: string) {
  const parsed = new URL(projectUrl)
  parsed.pathname = pathname
  parsed.search = ''
  parsed.hash = ''
  return parsed.toString()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function getMessage(value: unknown, fallback: string) {
  if (isRecord(value)) {
    if (typeof value.message === 'string') return value.message
    if (typeof value.error === 'string') return value.error
  }
  return fallback
}

function redactApplyMessage(value: string, adminKey: string) {
  const redacted = redactSensitiveData(value)
  if (!adminKey) return redacted
  return redacted.split(adminKey).join('***REDACTED***')
}

function sanitizeMigrationName(value: string) {
  return (
    value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-+/g, '-')
      .toLowerCase()
      .slice(0, 56) || 'brok-build-backend'
  )
}

function migrationVersionFromDate(date: Date) {
  const pad = (value: number) => value.toString().padStart(2, '0')
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds())
  ].join('')
}

function nextMigrationVersion(latestVersion: string | null, now: Date) {
  const current = migrationVersionFromDate(now)
  if (!latestVersion || current > latestVersion) return current

  const parsed = Date.UTC(
    Number(latestVersion.slice(0, 4)),
    Number(latestVersion.slice(4, 6)) - 1,
    Number(latestVersion.slice(6, 8)),
    Number(latestVersion.slice(8, 10)),
    Number(latestVersion.slice(10, 12)),
    Number(latestVersion.slice(12, 14)) + 1
  )

  if (Number.isNaN(parsed)) return current
  return migrationVersionFromDate(new Date(parsed))
}

function normalizeMigrations(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.migrations)) return []
  return value.migrations
    .filter(isRecord)
    .map(migration => ({
      version:
        typeof migration.version === 'string'
          ? migration.version.replace(/\D/g, '').slice(0, 14)
          : '',
      name: typeof migration.name === 'string' ? migration.name : ''
    }))
    .filter(migration => migration.version)
}

function normalizeBuckets(value: unknown) {
  const buckets =
    isRecord(value) && Array.isArray(value.buckets)
      ? value.buckets
      : Array.isArray(value)
        ? value
        : []

  return new Set(
    buckets
      .map(bucket =>
        typeof bucket === 'string'
          ? bucket
          : isRecord(bucket) && typeof bucket.name === 'string'
            ? bucket.name
            : ''
      )
      .filter(Boolean)
  )
}

async function readJson(response: Response) {
  return response.json().catch(() => null) as Promise<unknown>
}

async function insforgeRequest({
  projectUrl,
  adminKey,
  pathname,
  method = 'GET',
  body,
  fetchImpl
}: {
  projectUrl: string
  adminKey: string
  pathname: string
  method?: string
  body?: unknown
  fetchImpl: FetchLike
}) {
  const response = await fetchImpl(buildProjectApiUrl(projectUrl, pathname), {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminKey}`
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store'
  })
  const payload = await readJson(response)

  if (!response.ok) {
    throw Object.assign(
      new Error(
        getMessage(payload, `${pathname} returned HTTP ${response.status}`)
      ),
      { statusCode: response.status, payload }
    )
  }

  return { statusCode: response.status, payload }
}

function functionSourceFor({
  slug,
  purpose
}: {
  slug: string
  purpose: string
}) {
  return `const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

export default async function(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  return new Response(JSON.stringify({
    ok: true,
    slug: ${JSON.stringify(slug)},
    purpose: ${JSON.stringify(purpose)},
    message: 'Brok Build provisioned this InsForge function stub. Replace it with app-specific server logic when ready.'
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
`
}

function plannedStep(step: Omit<InsForgeBackendApplyStep, 'status'>) {
  return { ...step, status: 'pending' as const }
}

export async function applyInsForgeBackendResourcePlan({
  projectUrl,
  adminKey,
  plan,
  migrationNameSeed,
  dryRun = false,
  now = new Date(),
  fetchImpl = fetch
}: ApplyOptions): Promise<InsForgeBackendApplyResult> {
  const migrationName = sanitizeMigrationName(`brokcode-${migrationNameSeed}`)
  const appliedAt = now.toISOString()
  const steps: InsForgeBackendApplyStep[] = [
    plannedStep({
      id: 'migration',
      label: `Apply database migration ${migrationName}`,
      method: 'POST',
      pathname: '/api/database/migrations'
    }),
    ...plan.storageBuckets.map(bucket =>
      plannedStep({
        id: `bucket:${bucket.name}`,
        label: `Create ${bucket.visibility} storage bucket ${bucket.name}`,
        method: 'POST',
        pathname: '/api/storage/buckets'
      })
    ),
    ...plan.functions.map(fn =>
      plannedStep({
        id: `function:${fn.slug}`,
        label: `Deploy edge function ${fn.slug}`,
        method: 'POST',
        pathname: '/api/functions'
      })
    )
  ]

  if (dryRun) {
    return {
      provider: 'insforge',
      status: 'dry_run',
      dryRun,
      appliedAt,
      migrationVersion: null,
      migrationName,
      steps: steps.map(step => ({
        ...step,
        status: 'skipped',
        message: 'Dry run only; no InsForge resources were changed.'
      }))
    }
  }

  let migrationVersion: string | null = null

  try {
    const migrationsResponse = await insforgeRequest({
      projectUrl,
      adminKey,
      pathname: '/api/database/migrations',
      fetchImpl
    })
    const migrations = normalizeMigrations(migrationsResponse.payload)
    const latestVersion =
      migrations
        .map(migration => migration.version)
        .sort()
        .at(-1) ?? null
    migrationVersion = nextMigrationVersion(latestVersion, now)

    const migrationStep = steps[0]
    const migrationBody = {
      version: migrationVersion,
      name: migrationName,
      sql: plan.migrationSql
    }
    const migrationResponse = await insforgeRequest({
      projectUrl,
      adminKey,
      pathname: '/api/database/migrations',
      method: 'POST',
      body: migrationBody,
      fetchImpl
    })
    Object.assign(migrationStep, {
      status: 'applied',
      statusCode: migrationResponse.statusCode,
      message: `Applied migration ${migrationVersion}_${migrationName}.sql.`
    })

    const bucketResponse = await insforgeRequest({
      projectUrl,
      adminKey,
      pathname: '/api/storage/buckets',
      fetchImpl
    }).catch(() => null)
    const existingBuckets = normalizeBuckets(bucketResponse?.payload)

    for (const bucket of plan.storageBuckets) {
      const step = steps.find(item => item.id === `bucket:${bucket.name}`)!
      if (existingBuckets.has(bucket.name)) {
        Object.assign(step, {
          status: 'skipped',
          statusCode: bucketResponse?.statusCode ?? null,
          message: 'Bucket already exists.'
        })
        continue
      }

      const response = await insforgeRequest({
        projectUrl,
        adminKey,
        pathname: '/api/storage/buckets',
        method: 'POST',
        body: {
          bucketName: bucket.name,
          isPublic: bucket.visibility === 'public'
        },
        fetchImpl
      })
      existingBuckets.add(bucket.name)
      Object.assign(step, {
        status: 'applied',
        statusCode: response.statusCode,
        message: `Created ${bucket.visibility} bucket.`
      })
    }

    for (const fn of plan.functions) {
      const step = steps.find(item => item.id === `function:${fn.slug}`)!
      let exists = false
      await insforgeRequest({
        projectUrl,
        adminKey,
        pathname: `/api/functions/${encodeURIComponent(fn.slug)}`,
        fetchImpl
      })
        .then(() => {
          exists = true
        })
        .catch(() => {
          exists = false
        })

      const pathname = exists
        ? `/api/functions/${encodeURIComponent(fn.slug)}`
        : '/api/functions'
      const response = await insforgeRequest({
        projectUrl,
        adminKey,
        pathname,
        method: exists ? 'PUT' : 'POST',
        body: exists
          ? {
              name: fn.slug,
              description: fn.purpose,
              code: functionSourceFor(fn)
            }
          : {
              slug: fn.slug,
              name: fn.slug,
              description: fn.purpose,
              code: functionSourceFor(fn)
            },
        fetchImpl
      })
      Object.assign(step, {
        status: 'applied',
        method: exists ? 'PUT' : 'POST',
        pathname,
        statusCode: response.statusCode,
        message: exists ? 'Updated function.' : 'Created function.'
      })
    }

    return {
      provider: 'insforge',
      status: 'applied',
      dryRun,
      appliedAt,
      migrationVersion,
      migrationName,
      steps
    }
  } catch (error) {
    const failedStep = steps.find(step => step.status === 'pending')
    if (failedStep) {
      Object.assign(failedStep, {
        status: 'failed',
        statusCode:
          typeof (error as { statusCode?: unknown }).statusCode === 'number'
            ? (error as { statusCode: number }).statusCode
            : null,
        message:
          error instanceof Error
            ? redactApplyMessage(error.message, adminKey)
            : 'InsForge backend apply failed.'
      })
    }

    return {
      provider: 'insforge',
      status: 'failed',
      dryRun,
      appliedAt,
      migrationVersion,
      migrationName,
      steps: steps.map(step =>
        step.status === 'pending'
          ? { ...step, status: 'skipped', message: 'Skipped after failure.' }
          : step
      )
    }
  }
}
