import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as relations from './relations'
import * as schema from './schema'

// For server-side usage only
// Use restricted user for application if available, otherwise fall back to regular user
const isDevelopment = process.env.NODE_ENV === 'development'
const isTest = process.env.NODE_ENV === 'test'
const isNextProductionBuild =
  process.env.NEXT_PHASE === 'phase-production-build'
const canUseBuildDatabaseFallback = isTest || isNextProductionBuild

function isPlaceholderDatabaseUrl(value: string | undefined) {
  if (!value) return true
  const trimmed = value.trim()
  if (trimmed.length === 0) return true
  return /^\[\s*YOUR_[A-Z0-9_]+_URL\s*\]$/i.test(trimmed)
}

const hasRealDatabaseUrl =
  !isPlaceholderDatabaseUrl(process.env.DATABASE_URL) ||
  !isPlaceholderDatabaseUrl(process.env.DATABASE_RESTRICTED_URL)

if (!hasRealDatabaseUrl && !canUseBuildDatabaseFallback) {
  if (isDevelopment) {
    console.warn(
      '[DB] DATABASE_URL appears to be a placeholder; falling back to inert build URL so the dev server can boot. Set a real PostgreSQL URL in .env.local to enable data-backed features.'
    )
  } else {
    throw new Error(
        'DATABASE_URL or DATABASE_RESTRICTED_URL environment variable is not set'
    )
  }
}

// Connection with connection pooling for server environments
// Prefer restricted user for application runtime
const connectionString =
  process.env.DATABASE_RESTRICTED_URL && // Prefer restricted user
  !isPlaceholderDatabaseUrl(process.env.DATABASE_RESTRICTED_URL)
    ? process.env.DATABASE_RESTRICTED_URL
    : !isPlaceholderDatabaseUrl(process.env.DATABASE_URL)
      ? process.env.DATABASE_URL
      : canUseBuildDatabaseFallback || isDevelopment
        ? 'postgres://user:pass@localhost:5432/testdb'
        : undefined

if (!connectionString) {
  throw new Error(
    'DATABASE_URL or DATABASE_RESTRICTED_URL environment variable is not set'
  )
}

// Log which connection is being used (for debugging)
if (isDevelopment) {
  const usingInertFallback =
    connectionString === 'postgres://user:pass@localhost:5432/testdb'
  const label = usingInertFallback
    ? 'Inert Fallback (data-backed features disabled)'
    : process.env.DATABASE_RESTRICTED_URL &&
        !isPlaceholderDatabaseUrl(process.env.DATABASE_RESTRICTED_URL)
      ? 'Restricted User (RLS Active)'
      : 'Owner User (RLS Bypassed)'
  console.log('[DB] Using connection:', label)
}

// Keep runtime SSL behavior aligned with migrate.ts so Railway and similar hosted
// Postgres services work with their managed certificate chain.
const sslDisabled = process.env.DATABASE_SSL_DISABLED === 'true'
const sslConfig = sslDisabled
  ? false
  : isDevelopment || isTest
    ? false
    : { rejectUnauthorized: false }

function readMaxConnections() {
  const value = Number(
    process.env.DATABASE_MAX_CONNECTIONS ?? (isDevelopment ? 5 : 20)
  )

  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 5
}

type PostgresClient = ReturnType<typeof postgres>

const globalForDb = globalThis as typeof globalThis & {
  __brokPostgresClient?: PostgresClient
  __brokPostgresVerified?: boolean
}

const client =
  globalForDb.__brokPostgresClient ??
  postgres(connectionString, {
    ssl: sslConfig,
    prepare: false,
    max: readMaxConnections(),
    idle_timeout: 20,
    max_lifetime: 60 * 30
  })

if (isDevelopment) {
  globalForDb.__brokPostgresClient = client
}

export const db = drizzle(client, {
  schema: { ...schema, ...relations }
})

// Helper type for all tables
export type Schema = typeof schema

// Verify restricted user permissions on startup
if (
  process.env.DATABASE_RESTRICTED_URL &&
  !isTest &&
  !globalForDb.__brokPostgresVerified
) {
  globalForDb.__brokPostgresVerified = true
  // Only run verification in server environments, not during build
  if (typeof window === 'undefined' && process.env.NODE_ENV !== 'production') {
    ;(async () => {
      try {
        const result = await db.execute<{ current_user: string }>(
          sql`SELECT current_user`
        )
        const currentUser = result[0]?.current_user

        if (isDevelopment) {
          console.log('[DB] ✓ Connection verified as user:', currentUser)
        }

        // Verify it's the restricted user (app_user)
        if (
          currentUser &&
          !currentUser.includes('app_user') &&
          !currentUser.includes('neondb_owner')
        ) {
          console.warn(
            '[DB] ⚠️ Warning: Expected app_user but connected as:',
            currentUser
          )
        }
      } catch (error) {
        console.error('[DB] ✗ Failed to verify database connection:', error)
        // Log the error but don't terminate the application
        // This allows development to continue even with connection issues
      }
    })()
  }
}
