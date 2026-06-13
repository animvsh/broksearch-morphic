// App-type registry and AI-app detection helpers for Brok Build.
// The classifier is keyword-based for now; the PRD notes Brok can do this
// more deeply with an LLM call, but a deterministic classifier keeps the
// streaming build experience snappy and testable.

import { BROK_BUILD_APP_TYPES, type BrokBuildAppType, type BrokBuildEmptyStateChip, type ClassifiedApp } from './types'

const NON_AI_APP_TYPES: BrokBuildAppType[] = [
  'landing_page',
  'saas_app',
  'dashboard',
  'marketplace',
  'internal_tool',
  'crm',
  'tracker_app',
  'learning_app',
  'social_app',
  'admin_portal',
  'mobile_first_pwa'
]

const AI_APP_TYPES: BrokBuildAppType[] = [
  'ai_chat_app',
  'ai_image_app',
  'ai_voice_app',
  'ai_search_app',
  'rag_app'
]

type ClassifierRule = {
  appType: BrokBuildAppType
  aiSubType: ClassifiedApp['aiSubType']
  patterns: RegExp[]
  needs: string[]
  frontend: string
  backend: string
  weight?: number
}

const CLASSIFIER_RULES: ClassifierRule[] = [
  {
    appType: 'mobile_first_pwa',
    aiSubType: null,
    patterns: [
      /\bpwa\b/i,
      /\bmobile[- ]first\b/i,
      /\bphone app\b/i,
      /\bapp[- ]?like\b/i,
      /\bjournaling\b/i,
      /\bphoto log\b/i,
      /\bphoto (upload|logging)\b/i,
      /\bnutrition\b/i,
      /\bmeal (photo|log|tracker|tracking)\b/i
    ],
    needs: [
      'pwa_shell',
      'offline',
      'safe_areas',
      'install_banner',
      'photo_upload'
    ],
    frontend: 'Next.js + Tailwind (mobile-first PWA)',
    backend: 'InsForge',
    weight: 3
  },
  {
    appType: 'ai_chat_app',
    aiSubType: 'ai_chat',
    patterns: [
      /\bai[ -]?chat\b/i,
      /\bchatbot\b/i,
      /\bchat assistant\b/i,
      /\btalk to\b/i,
      /\bconversational\b/i
    ],
    needs: [
      'chat_ui',
      'model_gateway',
      'conversation_storage',
      'memory',
      'user_auth',
      'rate_limits'
    ],
    frontend: 'React + Vite + Tailwind',
    backend: 'InsForge'
  },
  {
    appType: 'ai_image_app',
    aiSubType: 'ai_image',
    patterns: [
      /\bimage[- ]?gen/i,
      /\btext[- ]?to[- ]?image\b/i,
      /\bthumbnail\b/i,
      /\bavatar\b/i,
      /\bimage studio\b/i,
      /\bphoto (generation|studio|generator)\b/i
    ],
    needs: [
      'image_upload',
      'storage_bucket',
      'model_call',
      'generated_results',
      'usage_limits',
      'history'
    ],
    frontend: 'React + Vite + Tailwind',
    backend: 'InsForge'
  },
  {
    appType: 'ai_voice_app',
    aiSubType: 'ai_voice',
    patterns: [
      /\bvoice\b/i,
      /\bspeech[- ]?to[- ]?text\b/i,
      /\btext[- ]?to[- ]?speech\b/i,
      /\bpodcast\b/i,
      /\bvoice (coach|assistant|cloning)\b/i,
      /\bcoach\b/i
    ],
    needs: [
      'voice_input',
      'voice_output',
      'conversation_memory',
      'user_auth',
      'rate_limits'
    ],
    frontend: 'React + Vite + Tailwind',
    backend: 'InsForge'
  },
  {
    appType: 'ai_search_app',
    aiSubType: 'ai_search',
    patterns: [
      /\bsearch engine\b/i,
      /\bweb search\b/i,
      /\bbroksearch\b/i,
      /\banswer engine\b/i,
      /\bgrounded search\b/i
    ],
    needs: [
      'search_input',
      'search_provider',
      'result_ranking',
      'citation_rendering',
      'user_auth'
    ],
    frontend: 'Next.js + Tailwind',
    backend: 'InsForge'
  },
  {
    appType: 'rag_app',
    aiSubType: 'rag',
    patterns: [
      /\brag\b/i,
      /\bchat with (my|your|the) (notes|files|documents|pdfs|books)\b/i,
      /\bdocument (search|chat|qa)\b/i,
      /\bnotes (app|assistant)\b/i,
      /\bsecond brain\b/i,
      /\bknowledge base\b/i,
      /\bcourse (material|chat)\b/i,
      /\bstudy app\b/i
    ],
    needs: [
      'file_upload',
      'embeddings',
      'vector_storage',
      'retrieval',
      'source_citations',
      'chat_interface'
    ],
    frontend: 'React + Vite + Tailwind',
    backend: 'InsForge'
  },
  {
    appType: 'crm',
    aiSubType: null,
    patterns: [
      /\bcrm\b/i,
      /\bcustomer relation/i,
      /\bcontacts? (and|with) (deals|tasks|notes)\b/i,
      /\bsales pipeline\b/i
    ],
    needs: ['auth', 'customers_table', 'notes_table', 'tasks_table'],
    frontend: 'React + Vite + Tailwind',
    backend: 'InsForge'
  },
  {
    appType: 'tracker_app',
    aiSubType: null,
    patterns: [
      /\btracker\b/i,
      /\bhabit\b/i,
      /\bjournal\b/i,
      /\bjournaling\b/i,
      /\bmood\b/i,
      /\bexpense\b/i
    ],
    needs: ['auth', 'entries_table', 'history_view'],
    frontend: 'React + Vite + Tailwind (mobile-first)',
    backend: 'InsForge'
  },
  {
    appType: 'learning_app',
    aiSubType: null,
    patterns: [
      /\blearn(ing)?\b/i,
      /\bcourse\b/i,
      /\bquiz\b/i,
      /\blesson\b/i,
      /\bflashcard/i,
      /\bmastery\b/i,
      /\bduolingo\b/i
    ],
    needs: ['auth', 'courses_table', 'progress_table', 'quiz_attempts_table'],
    frontend: 'React + Vite + Tailwind',
    backend: 'InsForge'
  },
  {
    appType: 'social_app',
    aiSubType: null,
    patterns: [
      /\bsocial\b/i,
      /\bcommunity\b/i,
      /\bforum\b/i,
      /\bfeed\b/i,
      /\bmessag(ing|e)\b/i,
      /\bfriend/i
    ],
    needs: ['auth', 'posts_table', 'comments_table', 'realtime'],
    frontend: 'Next.js + Tailwind',
    backend: 'InsForge'
  },
  {
    appType: 'admin_portal',
    aiSubType: null,
    patterns: [
      /\badmin (panel|portal|dashboard)\b/i,
      /\binternal (admin|tool)\b/i,
      /\bbackoffice\b/i
    ],
    needs: ['auth', 'role_guards', 'audit_log', 'kpi_cards'],
    frontend: 'React + Vite + Tailwind',
    backend: 'InsForge'
  },
  {
    appType: 'marketplace',
    aiSubType: null,
    patterns: [
      /\bmarketplace\b/i,
      /\bseller/i,
      /\blisting/i,
      /\bproduct catalog\b/i
    ],
    needs: ['auth', 'listings_table', 'orders_table', 'reviews_table'],
    frontend: 'Next.js + Tailwind',
    backend: 'InsForge'
  },
  {
    appType: 'saas_app',
    aiSubType: null,
    patterns: [
      /\bsaas\b/i,
      /\bbilling\b/i,
      /\bsubscription/i,
      /\bcheckout\b/i
    ],
    needs: ['auth', 'plans_table', 'subscriptions_table', 'billing'],
    frontend: 'Next.js + Tailwind',
    backend: 'InsForge'
  },
  {
    appType: 'dashboard',
    aiSubType: null,
    patterns: [
      /\bdashboard\b/i,
      /\busage analytics\b/i,
      /\bmetrics\b/i,
      /\bchart/i
    ],
    needs: ['auth', 'events_table', 'charts'],
    frontend: 'React + Vite + Tailwind',
    backend: 'InsForge'
  },
  {
    appType: 'internal_tool',
    aiSubType: null,
    patterns: [
      /\binternal tool\b/i,
      /\boperator tool\b/i,
      /\bops console\b/i
    ],
    needs: ['auth', 'approvals', 'audit_log'],
    frontend: 'React + Vite + Tailwind',
    backend: 'InsForge'
  },
  {
    appType: 'landing_page',
    aiSubType: null,
    patterns: [
      /\blanding (page|site)\b/i,
      /\bmarketing site\b/i,
      /\bhomepage\b/i
    ],
    needs: ['hero', 'features', 'pricing', 'cta'],
    frontend: 'Next.js + Tailwind',
    backend: 'InsForge (auth + waitlist)'
  }
]

const MOBILE_FIRST_HINTS = [
  /\bmobile[- ]first\b/i,
  /\bpwa\b/i,
  /\biphone\b/i,
  /\bphone app\b/i,
  /\bapp[- ]?like\b/i,
  /\bjournaling\b/i,
  /\btracker\b/i,
  /\bphoto log/i,
  /\bphoto (upload|logging)\b/i
]

export const BROK_BUILD_EMPTY_CHIPS: BrokBuildEmptyStateChip[] = [
  {
    id: 'ai-study',
    label: 'AI study',
    prompt:
      'Build me an AI study app where I upload notes and it creates lessons, quizzes, and tracks mastery.',
    appType: 'rag_app'
  },
  {
    id: 'nutrition-tracker',
    label: 'Nutrition tracker',
    prompt:
      'Build me a mobile-first AI nutrition tracker where users upload food photos, track calories, water, and micronutrients, and chat with their nutrition data.',
    appType: 'mobile_first_pwa'
  },
  {
    id: 'saas-dashboard',
    label: 'SaaS dashboard',
    prompt:
      'Build me a SaaS dashboard with login, usage analytics, billing, and an admin panel.',
    appType: 'saas_app'
  },
  {
    id: 'ai-search',
    label: 'AI search',
    prompt: 'Build me an AI search engine landing page with a query box and cited answers.',
    appType: 'ai_search_app'
  },
  {
    id: 'crm',
    label: 'CRM',
    prompt: 'Build me a CRM with login, customers, notes, and tasks.',
    appType: 'crm'
  },
  {
    id: 'marketplace',
    label: 'Marketplace',
    prompt: 'Build me a marketplace app with seller profiles and product listings.',
    appType: 'marketplace'
  },
  {
    id: 'internal-tool',
    label: 'Internal tool',
    prompt: 'Build me an internal tool with admin approvals and an audit log.',
    appType: 'internal_tool'
  },
  {
    id: 'ai-voice-coach',
    label: 'AI voice coach',
    prompt: 'Build me an AI voice coach for language learning with daily speaking practice.',
    appType: 'ai_voice_app'
  }
]

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'build',
  'create',
  'for',
  'in',
  'me',
  'my',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
  'please'
])

const KNOWN_ACRONYMS = new Set([
  'crm',
  'ai',
  'pwa',
  'ui',
  'ux',
  'api',
  'rag',
  'saas'
])

function titleCaseWord(word: string) {
  const lower = word.toLowerCase()
  if (KNOWN_ACRONYMS.has(lower)) {
    return lower.toUpperCase()
  }
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
}

function normalizePrompt(prompt: string) {
  return prompt.trim().toLowerCase()
}

function scoreRules(prompt: string) {
  const lower = normalizePrompt(prompt)
  const ranked: Array<{ rule: ClassifierRule; score: number }> = []
  for (const rule of CLASSIFIER_RULES) {
    let score = 0
    for (const pattern of rule.patterns) {
      if (pattern.test(prompt) || pattern.test(lower)) {
        score += rule.weight ?? 1
      }
    }
    if (score > 0) {
      ranked.push({ rule, score })
    }
  }
  ranked.sort((a, b) => b.score - a.score)
  return ranked
}

export function classifyApp(prompt: string): ClassifiedApp {
  const ranked = scoreRules(prompt)
  const top = ranked[0]

  if (!top) {
    return {
      appType: 'landing_page',
      isAiApp: false,
      aiSubType: null,
      confidence: 0.2,
      needs: ['hero', 'features', 'pricing', 'cta'],
      suggestedFrontend: 'Next.js + Tailwind',
      suggestedBackend: 'InsForge'
    }
  }

  const isMobileFirst = MOBILE_FIRST_HINTS.some(p => p.test(prompt))
  const isAiApp = AI_APP_TYPES.includes(top.rule.appType)
  const confidence = Math.min(1, 0.45 + top.score * 0.18)

  return {
    appType: top.rule.appType,
    isAiApp,
    aiSubType: top.rule.aiSubType,
    confidence,
    needs: top.rule.needs,
    suggestedFrontend: top.rule.frontend,
    suggestedBackend: top.rule.backend
  }
}

export function listAllAppTypes(): BrokBuildAppType[] {
  return [...BROK_BUILD_APP_TYPES]
}

export function isAiAppType(appType: BrokBuildAppType) {
  return AI_APP_TYPES.includes(appType)
}

export function isNonAiAppType(appType: BrokBuildAppType) {
  return NON_AI_APP_TYPES.includes(appType)
}

export function describeAppType(appType: BrokBuildAppType) {
  const rule = CLASSIFIER_RULES.find(r => r.appType === appType)
  if (rule) {
    return {
      label: appType.replace(/_/g, ' '),
      needs: rule.needs,
      frontend: rule.frontend,
      backend: rule.backend
    }
  }
  return {
    label: appType.replace(/_/g, ' '),
    needs: [],
    frontend: 'Next.js + Tailwind',
    backend: 'InsForge'
  }
}

export function inferTitle(prompt: string) {
  const words = prompt
    .replace(/[^a-zA-Z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter(word => !STOP_WORDS.has(word.toLowerCase()))
    .slice(0, 6)
  if (words.length === 0) return 'Brok App'
  return words.map(titleCaseWord).join(' ')
}

export function inferAudience(prompt: string, appType: BrokBuildAppType) {
  if (/\bstudent|class|campus|university/i.test(prompt)) {
    return 'Students working through course material.'
  }
  if (/\bteam|work|office/i.test(prompt)) {
    return 'Teams collaborating on shared work.'
  }
  if (/\bcustomer|client|buyer/i.test(prompt)) {
    return 'Customers and operators managing accounts.'
  }
  if (appType === 'mobile_first_pwa') {
    return 'People who want a simple on-phone experience.'
  }
  return 'People who want a focused tool without setup.'
}

export function inferDesignDirection(prompt: string, appType: BrokBuildAppType) {
  if (appType === 'mobile_first_pwa') {
    return 'Premium mobile-first feel with safe areas, large tap targets, and bottom navigation.'
  }
  if (appType === 'admin_portal' || appType === 'dashboard') {
    return 'Clean SaaS dashboard style with KPI cards, dense but readable tables, and side drawers.'
  }
  if (appType === 'crm') {
    return 'Familiar inbox + detail CRM feel with clear status badges and quick actions.'
  }
  if (appType === 'landing_page' || appType === 'marketplace') {
    return 'Modern marketing layout with strong hierarchy, social proof, and clear CTAs.'
  }
  if (appType === 'learning_app') {
    return 'Friendly Duolingo-style progression with streaks, levels, and positive feedback.'
  }
  if (/\bpremium\b/i.test(prompt)) {
    return 'Premium look with refined spacing, large type, and confident color choices.'
  }
  return 'Bright, modern, neutral base with one purposeful accent color.'
}
