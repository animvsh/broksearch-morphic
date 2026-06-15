// Brok Build plan generation.
// Produces both the user-visible plan and the deeper internal plan JSON
// described in the PRD (project_type, frontend, backend, hosting, coding_agent,
// ai_features, database_tables, storage_buckets, pages).

import {
  classifyApp,
  describeAppType,
  inferAudience,
  inferDesignDirection,
  inferTitle,
  isAiAppType
} from './app-types'
import type {
  BrokBuildAppType,
  ClassifiedApp,
  InternalPlan,
  UserVisiblePlan
} from './types'

const AI_FEATURES_BY_TYPE: Record<string, string[]> = {
  ai_chat_app: ['chat_ui', 'conversation_memory', 'streaming_responses'],
  ai_image_app: [
    'image_food_analysis',
    'meal_image_history',
    'daily_image_summary'
  ],
  ai_voice_app: [
    'voice_input',
    'voice_output',
    'pronunciation_feedback',
    'session_history'
  ],
  ai_search_app: ['web_search', 'answer_synthesis', 'source_citations'],
  rag_app: [
    'file_upload',
    'embeddings',
    'vector_retrieval',
    'chat_with_notes',
    'mastery_tracking'
  ],
  mobile_first_pwa: [
    'photo_upload',
    'food_recognition',
    'nutrition_estimates',
    'meal_summaries',
    'micronutrient_tracking',
    'chat_with_history'
  ],
  crm: ['customer_health_score', 'next_action_suggestions'],
  saas_app: ['usage_analytics', 'billing_summary', 'admin_overview'],
  dashboard: ['usage_charts', 'kpi_cards', 'drill_in'],
  learning_app: ['lesson_generation', 'quiz_generation', 'mastery_tracking'],
  admin_portal: ['role_guards', 'audit_log', 'rate_limits']
}

const TABLES_BY_TYPE: Record<string, string[]> = {
  ai_chat_app: ['users', 'conversations', 'messages', 'memories'],
  ai_image_app: ['users', 'image_jobs', 'image_results', 'usage_quotas'],
  ai_voice_app: ['users', 'voice_sessions', 'transcripts', 'usage_quotas'],
  ai_search_app: ['users', 'search_queries', 'search_results', 'citations'],
  rag_app: [
    'users',
    'uploaded_files',
    'embeddings',
    'chunks',
    'chat_messages',
    'mastery_scores'
  ],
  mobile_first_pwa: [
    'users',
    'profiles',
    'meals',
    'meal_items',
    'nutrients',
    'water_logs',
    'goals',
    'chat_messages'
  ],
  crm: ['users', 'customers', 'notes', 'tasks', 'activities'],
  saas_app: ['users', 'plans', 'subscriptions', 'usage_events'],
  dashboard: ['users', 'usage_events', 'kpi_snapshots'],
  learning_app: [
    'users',
    'courses',
    'lessons',
    'quizzes',
    'questions',
    'quiz_attempts',
    'mastery_scores'
  ],
  internal_tool: ['users', 'approvals', 'audit_events'],
  admin_portal: ['users', 'roles', 'audit_events', 'kpi_snapshots'],
  marketplace: ['users', 'sellers', 'listings', 'orders', 'reviews'],
  social_app: ['users', 'posts', 'comments', 'likes', 'messages'],
  tracker_app: ['users', 'entries', 'tags', 'reminders'],
  landing_page: ['subscribers', 'waitlist'],
  dashboard_only: ['users', 'events']
}

const STORAGE_BUCKETS_BY_TYPE: Record<string, string[]> = {
  mobile_first_pwa: ['meal_photos'],
  rag_app: ['course_uploads', 'generated_assets'],
  ai_image_app: ['generated_images', 'source_uploads'],
  ai_voice_app: ['voice_recordings'],
  saas_app: ['brand_assets'],
  learning_app: ['course_uploads', 'generated_assets'],
  crm: ['attachments'],
  marketplace: ['product_images']
}

const PAGES_BY_TYPE: Record<string, string[]> = {
  ai_chat_app: ['Landing', 'Auth', 'Chat', 'History', 'Settings'],
  ai_image_app: ['Landing', 'Studio', 'Gallery', 'Settings'],
  ai_voice_app: ['Landing', 'Practice', 'Sessions', 'Settings'],
  ai_search_app: ['Landing', 'Search', 'Result', 'History'],
  rag_app: ['Landing', 'Upload', 'Courses', 'Lesson', 'Quiz', 'Chat'],
  mobile_first_pwa: [
    'Onboarding',
    'Dashboard',
    'Log Meal',
    'Meal Detail',
    'Water Tracker',
    'Nutrition Chat',
    'Settings'
  ],
  crm: ['Landing', 'Auth', 'Inbox', 'Customer', 'Tasks', 'Settings'],
  saas_app: ['Landing', 'Auth', 'Dashboard', 'Billing', 'Admin', 'Settings'],
  dashboard: ['Dashboard', 'Detail', 'Settings'],
  learning_app: ['Home', 'Lesson', 'Quiz', 'Progress', 'Settings'],
  internal_tool: ['Console', 'Approvals', 'Logs', 'Settings'],
  admin_portal: ['Overview', 'Users', 'Logs', 'Settings'],
  marketplace: ['Home', 'Listing', 'Seller', 'Cart', 'Settings'],
  social_app: ['Feed', 'Profile', 'Messages', 'Settings'],
  tracker_app: ['Home', 'Log', 'History', 'Settings'],
  landing_page: ['Landing', 'Pricing', 'Waitlist']
}

const FUNCTIONS_BY_TYPE: Record<string, string[]> = {
  mobile_first_pwa: ['analyze-meal-photo', 'nutrition-chat', 'daily-summary'],
  ai_chat_app: ['chat-complete', 'memory-summarize'],
  ai_image_app: ['image-generate', 'image-queue'],
  ai_voice_app: ['transcribe-voice', 'synthesize-voice'],
  ai_search_app: ['web-search', 'answer-synthesize'],
  rag_app: [
    'parse-upload',
    'generate-course',
    'generate-quiz',
    'grade-answer',
    'chat-with-course',
    'update-mastery'
  ],
  crm: ['next-action-suggest'],
  saas_app: ['usage-summary', 'billing-summary'],
  learning_app: ['generate-quiz', 'update-mastery', 'chat-with-course']
}

const MODELS_BY_TYPE: Record<string, string[]> = {
  mobile_first_pwa: ['food_recognition_model', 'nutrition_estimation_model'],
  ai_chat_app: ['chat_model', 'summary_model'],
  ai_image_app: ['image_generation_model'],
  ai_voice_app: ['transcription_model', 'voice_synthesis_model'],
  ai_search_app: ['search_model', 'answer_synthesis_model'],
  rag_app: [
    'lesson_generation_model',
    'quiz_generation_model',
    'chat_model',
    'grading_model'
  ],
  crm: ['next_action_model'],
  saas_app: ['summarization_model']
}

const INTEGRATIONS_BY_TYPE: Record<string, string[]> = {
  mobile_first_pwa: ['camera', 'push_notifications', 'apple_health'],
  saas_app: ['stripe', 'sendgrid', 'posthog'],
  crm: ['gmail', 'google_calendar', 'slack'],
  marketplace: ['stripe', 'shippo'],
  learning_app: ['pdf_parser', 'youtube_transcript'],
  ai_search_app: ['tavily', 'brok_web_search'],
  ai_chat_app: ['brok_api', 'memory_store'],
  rag_app: ['pdf_parser', 'vector_store'],
  internal_tool: ['sso', 'audit_log'],
  admin_portal: ['audit_log', 'sso', 'feature_flags'],
  social_app: ['realtime', 'push_notifications'],
  tracker_app: ['reminders', 'apple_health'],
  landing_page: ['mailchimp', 'posthog'],
  dashboard: ['posthog', 'segment']
}

function uniq<T>(values: T[]) {
  return [...new Set(values)]
}

export function buildInternalPlan(
  prompt: string,
  classification?: ClassifiedApp
): { plan: InternalPlan; classification: ClassifiedApp } {
  const cls = classification ?? classifyApp(prompt)
  const meta = describeAppType(cls.appType)

  const tables = TABLES_BY_TYPE[cls.appType] ?? ['users', 'entries']
  const storageBuckets = STORAGE_BUCKETS_BY_TYPE[cls.appType] ?? []
  const pages = PAGES_BY_TYPE[cls.appType] ?? ['Landing', 'Settings']
  const functions = FUNCTIONS_BY_TYPE[cls.appType] ?? []
  const models = MODELS_BY_TYPE[cls.appType] ?? []
  const integrations = INTEGRATIONS_BY_TYPE[cls.appType] ?? []

  const aiFeatures = isAiAppType(cls.appType)
    ? AI_FEATURES_BY_TYPE[cls.appType] ?? []
    : AI_FEATURES_BY_TYPE[cls.appType] ?? []

  const plan: InternalPlan = {
    project_type: cls.appType,
    frontend: cls.suggestedFrontend ?? meta.frontend,
    backend: 'BrokCode starter state',
    hosting: 'BrokCode managed preview',
    coding_agent: 'BrokCode starter scaffold',
    ai_features: uniq(aiFeatures),
    database_tables: uniq(tables),
    storage_buckets: uniq(storageBuckets),
    pages: uniq(pages),
    models: uniq(models),
    functions: uniq(functions),
    integrations: uniq(integrations)
  }

  return { plan, classification: cls }
}

export function buildUserVisiblePlan(
  prompt: string,
  internalPlan: InternalPlan
): UserVisiblePlan {
  const appType = internalPlan.project_type as BrokBuildAppType
  const title = inferTitle(prompt)
  const audience = inferAudience(prompt, appType)
  const designDirection = inferDesignDirection(prompt, appType)

  const bullets: string[] = []
  for (const table of internalPlan.database_tables.slice(0, 3)) {
    bullets.push(`Stores ${table.replace(/_/g, ' ')}`)
  }
  for (const feature of internalPlan.ai_features.slice(0, 3)) {
    bullets.push(`Includes ${feature.replace(/_/g, ' ')}`)
  }
  for (const page of internalPlan.pages.slice(0, 4)) {
    bullets.push(`Builds the ${page} screen`)
  }
  if (internalPlan.storage_buckets.length > 0) {
    bullets.push(`Includes a starter ${internalPlan.storage_buckets[0]} asset area`)
  }
  bullets.push('Managed preview appears once the scaffold is ready')

  const oneLiner = friendlyOneLiner(appType, prompt)
  const backendSummary = `${internalPlan.backend} for ${internalPlan.database_tables.length} starter data groups and ${internalPlan.storage_buckets.length} asset areas, published through ${internalPlan.hosting}.`
  const aiFeatures = internalPlan.ai_features.map(f => f.replace(/_/g, ' '))

  return {
    title,
    oneLiner,
    bullets,
    designDirection,
    audience,
    aiFeatures,
    backendSummary
  }
}

function friendlyOneLiner(appType: BrokBuildAppType, prompt: string) {
  if (appType === 'mobile_first_pwa') {
    return `I'll build this as a mobile-first PWA with photo capture and chat.`
  }
  if (appType === 'rag_app') {
    return `I'll build this as an AI study/notes app with file upload, generated lessons, and chat with your material.`
  }
  if (appType === 'ai_chat_app') {
    return `I'll build this as an AI chat app with conversation memory and rate limits.`
  }
  if (appType === 'ai_image_app') {
    return `I'll build this as an AI image app with upload, generation history, and usage limits.`
  }
  if (appType === 'ai_voice_app') {
    return `I'll build this as an AI voice app with transcription, synthesis, and progress tracking.`
  }
  if (appType === 'ai_search_app') {
    return `I'll build this as an AI search engine with grounded answers and citations.`
  }
  if (appType === 'crm') {
    return `I'll build this as a focused CRM with customers, notes, and tasks.`
  }
  if (appType === 'saas_app') {
    return `I'll build this as a SaaS app with login, usage analytics, billing, and an admin panel.`
  }
  if (appType === 'admin_portal') {
    return `I'll build this as an admin portal with role guards, audit log, and KPI cards.`
  }
  if (appType === 'marketplace') {
    return `I'll build this as a marketplace with seller profiles and product listings.`
  }
  if (appType === 'internal_tool') {
    return `I'll build this as an internal tool with admin approvals and an audit log.`
  }
  if (appType === 'learning_app') {
    return `I'll build this as a learning app with lessons, quizzes, and mastery tracking.`
  }
  if (appType === 'tracker_app') {
    return `I'll build this as a tracker with history, reminders, and a simple dashboard.`
  }
  if (appType === 'social_app') {
    return `I'll build this as a social app with a feed, profiles, and realtime updates.`
  }
  if (appType === 'dashboard') {
    return `I'll build this as a dashboard with KPI cards, charts, and drill-in details.`
  }
  if (appType === 'landing_page') {
    return `I'll build this as a polished landing page with hero, features, and a clear CTA.`
  }
  return `I'll build this as a ${(appType as string).replace(/_/g, ' ')} per your prompt.`
}
