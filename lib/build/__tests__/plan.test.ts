import { describe, expect, it } from 'vitest'

import { buildInternalPlan, buildUserVisiblePlan } from '@/lib/build/plan'

describe('buildInternalPlan', () => {
  it('builds a RAG plan with embeddings, vector storage, citations', () => {
    const { plan } = buildInternalPlan(
      'Build me an AI study app where I upload notes and it creates lessons'
    )
    expect(plan.project_type).toBe('rag_app')
    expect(plan.coding_agent).toBe('BrokCode starter scaffold')
    expect(plan.hosting).toBe('BrokCode managed preview')
    expect(plan.backend).toBe('BrokCode starter state')
    expect(plan.ai_features.length).toBeGreaterThan(0)
    expect(plan.database_tables).toContain('embeddings')
    expect(plan.storage_buckets).toContain('course_uploads')
    expect(plan.pages).toContain('Lesson')
    expect(plan.functions).toContain('parse-upload')
  })

  it('builds a nutrition plan with meal tables, photo storage, and chat', () => {
    const { plan, classification } = buildInternalPlan(
      'Build me a mobile-first AI nutrition tracker with photo upload and chat'
    )
    expect(plan.project_type).toBe('mobile_first_pwa')
    expect(plan.database_tables).toContain('meals')
    expect(plan.database_tables).toContain('water_logs')
    expect(plan.storage_buckets).toContain('meal_photos')
    expect(plan.functions).toContain('analyze-meal-photo')
    expect(classification.isAiApp).toBe(false)
  })

  it('builds a CRM plan with the right tables', () => {
    const { plan } = buildInternalPlan(
      'Build me a CRM with login, customers, notes, and tasks'
    )
    expect(plan.project_type).toBe('crm')
    expect(plan.database_tables).toEqual(
      expect.arrayContaining(['users', 'customers', 'notes', 'tasks'])
    )
  })

  it('builds a SaaS dashboard plan with billing features', () => {
    const { plan } = buildInternalPlan(
      'Build me a SaaS dashboard with login, usage analytics, billing, and admin panel'
    )
    expect(plan.project_type).toBe('saas_app')
    expect(plan.database_tables).toEqual(
      expect.arrayContaining(['users', 'plans', 'subscriptions'])
    )
  })

  it('describes the starter scaffold and managed preview honestly', () => {
    const { plan } = buildInternalPlan('Build me anything')
    expect(plan.coding_agent).toBe('BrokCode starter scaffold')
    expect(plan.hosting).toBe('BrokCode managed preview')
    expect(plan.backend).toBe('BrokCode starter state')
  })
})

describe('buildUserVisiblePlan', () => {
  it('produces a friendly one-liner and a bullet list', () => {
    const { plan: internalPlan } = buildInternalPlan(
      'Build me a mobile-first AI nutrition tracker'
    )
    const userPlan = buildUserVisiblePlan(
      'Build me a mobile-first AI nutrition tracker',
      internalPlan
    )
    expect(userPlan.title.length).toBeGreaterThan(0)
    expect(userPlan.oneLiner.length).toBeGreaterThan(0)
    expect(userPlan.bullets.length).toBeGreaterThan(2)
    expect(userPlan.designDirection.length).toBeGreaterThan(0)
    expect(userPlan.audience.length).toBeGreaterThan(0)
    expect(userPlan.backendSummary).toContain('BrokCode starter state')
    expect(userPlan.backendSummary).toContain('BrokCode managed preview')
  })

  it('describes AI features for AI apps', () => {
    const { plan: internalPlan } = buildInternalPlan(
      'Build me an AI study app with notes upload'
    )
    const userPlan = buildUserVisiblePlan(
      'Build me an AI study app with notes upload',
      internalPlan
    )
    expect(userPlan.aiFeatures.length).toBeGreaterThan(0)
  })
})
