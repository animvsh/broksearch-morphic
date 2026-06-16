import type {
  BrokBuildBackendResourcePlan,
  InternalPlan
} from './types'

const DEFAULT_TABLE_COLUMNS: BrokBuildBackendResourcePlan['tables'][number]['columns'] = [
  { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
  { name: 'owner_id', type: 'text', nullable: false },
  { name: 'title', type: 'text', nullable: false },
  { name: 'status', type: 'text', nullable: false },
  { name: 'metadata', type: 'jsonb', nullable: true },
  { name: 'created_at', type: 'timestamptz', nullable: false },
  { name: 'updated_at', type: 'timestamptz', nullable: false }
]

function toSnakeCase(input: string, fallback: string) {
  const normalized = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .toLowerCase()

  return normalized || fallback
}

function uniqueNames(values: string[], fallbackPrefix: string) {
  const seen = new Map<string, number>()
  return values.map((value, index) => {
    const base = toSnakeCase(value, `${fallbackPrefix}_${index + 1}`)
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    return count === 0 ? base : `${base}_${count + 1}`
  })
}

function tableNameFor(value: string, index: number) {
  const base = toSnakeCase(value, `table_${index + 1}`)
  if (base.endsWith('s')) return base
  return `${base}s`
}

export function buildInsForgeBackendResourcePlan(
  internalPlan: InternalPlan,
  title = 'brok_app'
): BrokBuildBackendResourcePlan {
  const appSlug = toSnakeCase(title, 'brok_app').slice(0, 48)
  const tableNames = uniqueNames(
    internalPlan.database_tables.map(tableNameFor),
    `${appSlug}_table`
  )
  const bucketNames = uniqueNames(
    internalPlan.storage_buckets.map(bucket => `${appSlug}_${bucket}`),
    `${appSlug}_bucket`
  )
  const functionSlugs = uniqueNames(
    internalPlan.functions.map(fn => `${appSlug}_${fn}`),
    `${appSlug}_function`
  )

  return {
    provider: 'insforge',
    status: 'planned',
    tables: tableNames.map(name => ({
      name,
      columns: DEFAULT_TABLE_COLUMNS.map(column => ({ ...column })),
      rls: ['owner-read-write', 'service-role-admin']
    })),
    storageBuckets: bucketNames.map(name => ({
      name,
      visibility: 'private',
      policies: ['owner-read-write', 'public-read-disabled']
    })),
    functions: functionSlugs.map((slug, index) => ({
      slug,
      purpose: internalPlan.functions[index] ?? slug
    })),
    publicEnv: [
      'NEXT_PUBLIC_INSFORGE_URL',
      'NEXT_PUBLIC_INSFORGE_ANON_KEY',
      'VITE_INSFORGE_URL',
      'VITE_INSFORGE_ANON_KEY'
    ],
    privateEnv: ['INSFORGE_API_KEY'],
    applySteps: [
      `npx @insforge/cli db migrations new brokcode_${appSlug}`,
      'npx @insforge/cli db migrations up',
      ...bucketNames.map(
        bucket => `npx @insforge/cli storage create-bucket ${bucket} --private`
      ),
      ...functionSlugs.map(
        slug => `npx @insforge/cli functions deploy ${slug}`
      )
    ]
  }
}
