import { describe, expect, it } from 'vitest'

import {
  classifyApp,
  describeAppType,
  inferAudience,
  inferDesignDirection,
  inferTitle,
  isAiAppType,
  isNonAiAppType,
  listAllAppTypes
} from '@/lib/build/app-types'
import { BROK_BUILD_APP_TYPES } from '@/lib/build/types'

describe('classifyApp', () => {
  it('classifies a nutrition tracker prompt as mobile-first PWA', () => {
    const result = classifyApp(
      'Build me a mobile-first AI nutrition tracker where users upload food photos and chat with their nutrition data'
    )
    expect(result.appType).toBe('mobile_first_pwa')
    expect(isAiAppType('mobile_first_pwa')).toBe(false)
  })

  it('classifies RAG/notes prompts as rag_app', () => {
    const result = classifyApp(
      'Build me an AI study app where I upload notes and it creates lessons, quizzes, and tracks mastery'
    )
    expect(result.appType).toBe('rag_app')
    expect(result.isAiApp).toBe(true)
    expect(result.aiSubType).toBe('rag')
  })

  it('classifies an AI chat app', () => {
    const result = classifyApp('Build me an AI chatbot for our customers')
    expect(result.appType).toBe('ai_chat_app')
    expect(result.isAiApp).toBe(true)
    expect(result.aiSubType).toBe('ai_chat')
  })

  it('classifies an image-generation prompt as ai_image_app', () => {
    const result = classifyApp('Build me an AI image studio with thumbnail generation')
    expect(result.appType).toBe('ai_image_app')
  })

  it('classifies an AI voice coach as ai_voice_app', () => {
    const result = classifyApp('Build me an AI voice coach for language learning')
    expect(result.appType).toBe('ai_voice_app')
  })

  it('classifies an AI search engine as ai_search_app', () => {
    const result = classifyApp('Build me an AI search engine with cited answers')
    expect(result.appType).toBe('ai_search_app')
  })

  it('classifies a CRM as crm', () => {
    const result = classifyApp('Build me a CRM with login, customers, notes, and tasks')
    expect(result.appType).toBe('crm')
    expect(result.isAiApp).toBe(false)
  })

  it('classifies a SaaS dashboard as saas_app', () => {
    const result = classifyApp(
      'Build me a SaaS dashboard with login, usage analytics, billing, and admin panel'
    )
    expect(result.appType).toBe('saas_app')
  })

  it('classifies a marketplace prompt as marketplace', () => {
    const result = classifyApp('Build me a marketplace app with seller profiles')
    expect(result.appType).toBe('marketplace')
  })

  it('classifies a landing page prompt', () => {
    const result = classifyApp('Build me a landing page for our product')
    expect(result.appType).toBe('landing_page')
  })

  it('does not confuse social proof landing copy with a social app', () => {
    const result = classifyApp(
      'Create a polished single-page bakery landing page with a hero, menu cards, social proof, and a working newsletter form.'
    )
    expect(result.appType).toBe('landing_page')
  })

  it('falls back to landing_page for unrelated prompts', () => {
    const result = classifyApp('hello world')
    expect(result.appType).toBe('landing_page')
  })

  it('marks AI app types as AI apps and others as non-AI', () => {
    expect(isAiAppType('ai_chat_app')).toBe(true)
    expect(isAiAppType('ai_image_app')).toBe(true)
    expect(isAiAppType('ai_voice_app')).toBe(true)
    expect(isAiAppType('ai_search_app')).toBe(true)
    expect(isAiAppType('rag_app')).toBe(true)
    expect(isAiAppType('crm')).toBe(false)
    expect(isNonAiAppType('crm')).toBe(true)
  })
})

describe('describeAppType', () => {
  it('returns metadata for known app types', () => {
    const meta = describeAppType('rag_app')
    expect(meta.label).toBeTruthy()
    expect(meta.needs.length).toBeGreaterThan(0)
  })

  it('returns generic metadata for unknown app types', () => {
    const meta = describeAppType('totally_new_type' as never)
    expect(meta.label).toBe('totally new type')
    expect(meta.frontend).toBeTruthy()
    expect(meta.backend).toBeTruthy()
  })
})

describe('inferTitle', () => {
  it('strips common prompt verbs', () => {
    expect(inferTitle('Build me a CRM with customers, notes, and tasks')).toBe(
      'CRM Customers Notes Tasks'
    )
  })

  it('caps at six words', () => {
    const title = inferTitle(
      'Build me a beautiful AI nutrition tracker with photo logging and chat'
    )
    expect(title.split(' ').length).toBeLessThanOrEqual(6)
  })

  it('returns a default for empty prompts', () => {
    expect(inferTitle('')).toBe('Brok App')
  })
})

describe('inferAudience and inferDesignDirection', () => {
  it('detects student audience', () => {
    expect(inferAudience('Build a study app for students', 'rag_app')).toMatch(
      /student/i
    )
  })

  it('returns mobile design direction for PWA prompts', () => {
    expect(
      inferDesignDirection('Build me a mobile-first PWA', 'mobile_first_pwa')
    ).toMatch(/mobile/i)
  })

  it('returns dashboard design direction for dashboards', () => {
    expect(inferDesignDirection('Build a dashboard', 'dashboard')).toMatch(
      /dashboard/i
    )
  })
})

describe('listAllAppTypes', () => {
  it('matches the canonical list', () => {
    expect(listAllAppTypes().sort()).toEqual(
      [...BROK_BUILD_APP_TYPES].sort()
    )
  })
})
