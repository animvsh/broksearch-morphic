// Core types for the Brok Build full user flow.
// Covers app classification, planning, build stream events, and project brain.

export const BROK_BUILD_APP_TYPES = [
  'landing_page',
  'saas_app',
  'dashboard',
  'marketplace',
  'ai_chat_app',
  'ai_image_app',
  'ai_voice_app',
  'ai_search_app',
  'rag_app',
  'internal_tool',
  'crm',
  'tracker_app',
  'learning_app',
  'social_app',
  'admin_portal',
  'mobile_first_pwa'
] as const

export type BrokBuildAppType = (typeof BROK_BUILD_APP_TYPES)[number]

export const BROK_BUILD_PHASES = [
  'idle',
  'understanding',
  'planning_core_modules',
  'designing_backend_schema',
  'preparing_backend',
  'starting_opencode',
  'generating_frontend',
  'wiring_backend',
  'building_preview',
  'ready',
  'failed',
  'adjusting'
] as const

export type BrokBuildPhase = (typeof BROK_BUILD_PHASES)[number]

export type BrokStreamEvent =
  | { kind: 'phase'; phase: BrokBuildPhase; message: string }
  | { kind: 'progress'; phase: BrokBuildPhase; percent: number }
  | { kind: 'plan'; plan: UserVisiblePlan }
  | { kind: 'internal_plan'; internalPlan: InternalPlan }
  | {
      kind: 'brokcode_project'
      projectId: string
      previewUrl: string | null
      deploymentUrl: string | null
      fileCount: number
    }
  | { kind: 'files'; files: BrokBuildFilePreview[] }
  | { kind: 'log'; level: 'info' | 'warn' | 'error'; message: string }
  | { kind: 'preview_url'; url: string | null }
  | { kind: 'opencode_session'; sessionId: string }
  | { kind: 'backend_status'; status: BrokBuildBackendStatus }
  | { kind: 'done'; projectId: string; previewUrl: string | null }
  | { kind: 'error'; message: string }

export type BrokBuildBackendStatus =
  | 'not_started'
  | 'provisioning'
  | 'connected'
  | 'failed'

export type BrokBuildFilePreview = {
  path: string
  language?: string | null
  size: number
  preview?: string | null
}

export type UserVisiblePlan = {
  title: string
  oneLiner: string
  bullets: string[]
  designDirection: string
  audience: string
  aiFeatures: string[]
  backendSummary: string
}

export type InternalPlan = {
  project_type: BrokBuildAppType
  frontend: string
  backend: string
  hosting: string
  coding_agent: string
  ai_features: string[]
  database_tables: string[]
  storage_buckets: string[]
  pages: string[]
  models: string[]
  functions: string[]
  integrations: string[]
}

export type ClassifiedApp = {
  appType: BrokBuildAppType
  isAiApp: boolean
  aiSubType: 'ai_chat' | 'ai_image' | 'ai_voice' | 'ai_search' | 'rag' | null
  confidence: number
  needs: string[]
  suggestedFrontend: string
  suggestedBackend: string
}

export type BrokBuildSession = {
  id: string
  prompt: string
  classification: ClassifiedApp
  internalPlan: InternalPlan
  userPlan: UserVisiblePlan
  phase: BrokBuildPhase
  createdAt: string
  previewUrl: string | null
  projectId: string | null
}

export type BrokBuildEmptyStateChip = {
  id: string
  label: string
  prompt: string
  appType: BrokBuildAppType
  icon?: string
}

export const DEFAULT_BROK_BUILD_MODEL = 'brok-build-architect'

export const PHASE_LABELS: Record<string, string> = {
  idle: 'Idle',
  understanding: 'Understanding',
  planning_core_modules: 'Planning core modules',
  designing_backend_schema: 'Designing backend schema',
  preparing_backend: 'Preparing backend',
  starting_opencode: 'Starting OpenCode',
  generating_frontend: 'Generating frontend',
  wiring_backend: 'Wiring backend',
  building_preview: 'Building preview',
  ready: 'Ready',
  failed: 'Failed',
  adjusting: 'Adjusting'
}
