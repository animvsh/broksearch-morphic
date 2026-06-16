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

function quoteIdent(identifier: string) {
  return `"${identifier.replace(/"/g, '""')}"`
}

function buildMigrationSql(tableNames: string[]) {
  if (tableNames.length === 0) {
    return [
      '-- No application tables were inferred for this Brok Build plan.',
      '-- Add tables here before applying the migration if the app needs persistence.'
    ].join('\n')
  }

  return tableNames
    .flatMap(tableName => {
      const quoted = quoteIdent(tableName)
      return [
        `create table if not exists public.${quoted} (`,
        '  id uuid primary key default gen_random_uuid(),',
        '  owner_id uuid not null references auth.users(id) on delete cascade,',
        '  title text not null,',
        "  status text not null default 'active',",
        "  metadata jsonb not null default '{}'::jsonb,",
        '  created_at timestamptz not null default now(),',
        '  updated_at timestamptz not null default now()',
        ');',
        '',
        `create index if not exists ${quoteIdent(`${tableName}_owner_id_idx`)} on public.${quoted} (owner_id);`,
        `create index if not exists ${quoteIdent(`${tableName}_status_idx`)} on public.${quoted} (status);`,
        '',
        `alter table public.${quoted} enable row level security;`,
        '',
        `drop policy if exists ${quoteIdent(`${tableName}_owner_select`)} on public.${quoted};`,
        `create policy ${quoteIdent(`${tableName}_owner_select`)}`,
        `  on public.${quoted} for select`,
        '  using (owner_id = auth.uid());',
        '',
        `drop policy if exists ${quoteIdent(`${tableName}_owner_insert`)} on public.${quoted};`,
        `create policy ${quoteIdent(`${tableName}_owner_insert`)}`,
        `  on public.${quoted} for insert`,
        '  with check (owner_id = auth.uid());',
        '',
        `drop policy if exists ${quoteIdent(`${tableName}_owner_update`)} on public.${quoted};`,
        `create policy ${quoteIdent(`${tableName}_owner_update`)}`,
        `  on public.${quoted} for update`,
        '  using (owner_id = auth.uid())',
        '  with check (owner_id = auth.uid());',
        '',
        `drop policy if exists ${quoteIdent(`${tableName}_owner_delete`)} on public.${quoted};`,
        `create policy ${quoteIdent(`${tableName}_owner_delete`)}`,
        `  on public.${quoted} for delete`,
        '  using (owner_id = auth.uid());',
        '',
        `drop trigger if exists ${quoteIdent(`${tableName}_set_updated_at`)} on public.${quoted};`,
        `create trigger ${quoteIdent(`${tableName}_set_updated_at`)}`,
        `  before update on public.${quoted}`,
        '  for each row execute function system.update_updated_at();'
      ]
    })
    .join('\n\n')
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
  const migrationSql = buildMigrationSql(tableNames)

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
    ],
    migrationSql
  }
}
