import { describe, expect, it } from 'vitest'

import { buildInsForgeBackendResourcePlan } from '@/lib/build/backend-plan'
import type { InternalPlan } from '@/lib/build/types'

const basePlan: InternalPlan = {
  project_type: 'crm',
  frontend: 'Next.js app router',
  backend: 'BrokCode starter state',
  hosting: 'BrokCode managed preview',
  coding_agent: 'BrokCode',
  ai_features: [],
  database_tables: ['Customers', 'Customer Notes', 'Customer Notes'],
  storage_buckets: ['Uploaded Files'],
  pages: ['Dashboard'],
  models: [],
  functions: ['Send Follow Up Email'],
  integrations: []
}

describe('buildInsForgeBackendResourcePlan', () => {
  it('turns the Brok Build internal plan into deterministic InsForge resources', () => {
    const plan = buildInsForgeBackendResourcePlan(basePlan, 'Sales CRM!')

    expect(plan).toMatchObject({
      provider: 'insforge',
      status: 'planned'
    })
    expect(plan.tables.map(table => table.name)).toEqual([
      'customers',
      'customer_notes',
      'customer_notes_2'
    ])
    expect(plan.tables[0].columns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'id',
          type: 'uuid',
          primaryKey: true
        }),
        expect.objectContaining({ name: 'owner_id', nullable: false }),
        expect.objectContaining({ name: 'metadata', type: 'jsonb' })
      ])
    )
    expect(plan.tables[0].rls).toEqual([
      'owner-read-write',
      'service-role-admin'
    ])
    expect(plan.storageBuckets).toEqual([
      {
        name: 'sales_crm_uploaded_files',
        visibility: 'private',
        policies: ['owner-read-write', 'public-read-disabled']
      }
    ])
    expect(plan.functions).toEqual([
      {
        slug: 'sales_crm_send_follow_up_email',
        purpose: 'Send Follow Up Email'
      }
    ])
    expect(plan.publicEnv).toContain('NEXT_PUBLIC_INSFORGE_URL')
    expect(plan.privateEnv).toContain('INSFORGE_API_KEY')
    expect(plan.applySteps).toEqual(
      expect.arrayContaining([
        'npx @insforge/cli db migrations new brokcode_sales_crm',
        'npx @insforge/cli db migrations up',
        'npx @insforge/cli storage create-bucket sales_crm_uploaded_files --private',
        'npx @insforge/cli functions deploy sales_crm_send_follow_up_email'
      ])
    )
  })
})
