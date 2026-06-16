export type PlanName =
  | 'free'
  | 'starter'
  | 'pro'
  | 'team'
  | 'scale'
  | 'enterprise'

export interface PlanLimitRow {
  plan: PlanName
  displayName: string
  description: string
  requestsPerDay: number | null
  requestsPerMinute: number | null
  tokensPerDay: number | null
  tokensPerMonth: number | null
  appGenerationsPerDay: number | null
  appProjectsPerUser: number | null
  presentationsPerMonth: number | null
  slidesPerMonth: number | null
  aiImagesPerMonth: number | null
  pptxExportsPerMonth: number | null
  apiCallsPerMinute: number | null
  monthlyBudgetCents: number | null
  maxOutputTokens: number | null
  maxBuildRepairAttempts: number | null
  apiAccess: 'disabled' | 'test-only' | 'enabled'
}

export const PLAN_LIMITS: PlanLimitRow[] = [
  {
    plan: 'free',
    displayName: 'Free',
    description: 'Discovery tier with capped daily usage and test-only API.',
    requestsPerDay: 100,
    requestsPerMinute: 10,
    tokensPerDay: 250_000,
    tokensPerMonth: 1_000_000,
    appGenerationsPerDay: 20,
    appProjectsPerUser: 3,
    presentationsPerMonth: 3,
    slidesPerMonth: 30,
    aiImagesPerMonth: 25,
    pptxExportsPerMonth: 3,
    apiCallsPerMinute: 0,
    monthlyBudgetCents: 0,
    maxOutputTokens: 4000,
    maxBuildRepairAttempts: 2,
    apiAccess: 'test-only'
  },
  {
    plan: 'starter',
    displayName: 'Starter',
    description: 'Light paid tier for solo creators and prototypes.',
    requestsPerDay: 500,
    requestsPerMinute: 30,
    tokensPerDay: 1_500_000,
    tokensPerMonth: 10_000_000,
    appGenerationsPerDay: 80,
    appProjectsPerUser: 10,
    presentationsPerMonth: 25,
    slidesPerMonth: 250,
    aiImagesPerMonth: 200,
    pptxExportsPerMonth: 25,
    apiCallsPerMinute: 30,
    monthlyBudgetCents: 2_000,
    maxOutputTokens: 8000,
    maxBuildRepairAttempts: 3,
    apiAccess: 'enabled'
  },
  {
    plan: 'pro',
    displayName: 'Pro',
    description:
      'Power user plan with higher search, generation, and API quotas.',
    requestsPerDay: 5_000,
    requestsPerMinute: 120,
    tokensPerDay: 10_000_000,
    tokensPerMonth: 100_000_000,
    appGenerationsPerDay: 300,
    appProjectsPerUser: 50,
    presentationsPerMonth: 100,
    slidesPerMonth: 1_000,
    aiImagesPerMonth: 1_500,
    pptxExportsPerMonth: 100,
    apiCallsPerMinute: 120,
    monthlyBudgetCents: 15_000,
    maxOutputTokens: 16_000,
    maxBuildRepairAttempts: 4,
    apiAccess: 'enabled'
  },
  {
    plan: 'team',
    displayName: 'Team',
    description:
      'Shared workspace with team billing, brand themes, and admin controls.',
    requestsPerDay: 25_000,
    requestsPerMinute: 300,
    tokensPerDay: 50_000_000,
    tokensPerMonth: 500_000_000,
    appGenerationsPerDay: 1_500,
    appProjectsPerUser: 250,
    presentationsPerMonth: 500,
    slidesPerMonth: 5_000,
    aiImagesPerMonth: 10_000,
    pptxExportsPerMonth: 500,
    apiCallsPerMinute: 300,
    monthlyBudgetCents: 75_000,
    maxOutputTokens: 32_000,
    maxBuildRepairAttempts: 5,
    apiAccess: 'enabled'
  },
  {
    plan: 'scale',
    displayName: 'Scale',
    description: 'High-traffic teams with elevated quotas and concurrency.',
    requestsPerDay: 100_000,
    requestsPerMinute: 600,
    tokensPerDay: 200_000_000,
    tokensPerMonth: 2_000_000_000,
    appGenerationsPerDay: 6_000,
    appProjectsPerUser: 1_000,
    presentationsPerMonth: 2_000,
    slidesPerMonth: 25_000,
    aiImagesPerMonth: 50_000,
    pptxExportsPerMonth: 2_000,
    apiCallsPerMinute: 600,
    monthlyBudgetCents: 300_000,
    maxOutputTokens: 64_000,
    maxBuildRepairAttempts: 6,
    apiAccess: 'enabled'
  },
  {
    plan: 'enterprise',
    displayName: 'Enterprise',
    description:
      'Custom contract with negotiated limits and dedicated capacity.',
    requestsPerDay: null,
    requestsPerMinute: null,
    tokensPerDay: null,
    tokensPerMonth: null,
    appGenerationsPerDay: null,
    appProjectsPerUser: null,
    presentationsPerMonth: null,
    slidesPerMonth: null,
    aiImagesPerMonth: null,
    pptxExportsPerMonth: null,
    apiCallsPerMinute: null,
    monthlyBudgetCents: null,
    maxOutputTokens: null,
    maxBuildRepairAttempts: null,
    apiAccess: 'enabled'
  }
]

export const PLAN_LIMITS_CATALOG: PlanLimitRow[] = PLAN_LIMITS

export interface LimitTypeDescriptor {
  id: string
  label: string
  description: string
  unit: string
}

export const LIMIT_TYPES: LimitTypeDescriptor[] = [
  {
    id: 'rpm',
    label: 'Requests / minute',
    description: 'Short burst limit per API key.',
    unit: 'rpm'
  },
  {
    id: 'rpd',
    label: 'Requests / day',
    description: 'Daily request quota per workspace or key.',
    unit: 'req/day'
  },
  {
    id: 'tokens_per_day',
    label: 'Tokens / day',
    description: 'Sum of input + output tokens per day.',
    unit: 'tok/day'
  },
  {
    id: 'tokens_per_month',
    label: 'Tokens / month',
    description: 'Sum of input + output tokens per month.',
    unit: 'tok/month'
  },
  {
    id: 'app_generations_per_day',
    label: 'App generations / day',
    description: 'Number of BrokCode app builds per day.',
    unit: 'apps/day'
  },
  {
    id: 'projects_per_user',
    label: 'Projects / user',
    description: 'Maximum active BrokCode projects per user.',
    unit: 'projects'
  },
  {
    id: 'presentations_per_month',
    label: 'Presentations / month',
    description: 'Presentations created per workspace per month.',
    unit: 'decks/month'
  },
  {
    id: 'slides_per_month',
    label: 'Slides / month',
    description: 'Slides generated per workspace per month.',
    unit: 'slides/month'
  },
  {
    id: 'ai_images_per_month',
    label: 'AI images / month',
    description: 'AI image generations per workspace per month.',
    unit: 'images/month'
  },
  {
    id: 'pptx_exports_per_month',
    label: 'PPTX exports / month',
    description: 'PowerPoint export jobs per workspace per month.',
    unit: 'exports/month'
  },
  {
    id: 'api_calls_per_minute',
    label: 'API calls / minute',
    description: 'Public API per-minute throttle.',
    unit: 'calls/min'
  },
  {
    id: 'monthly_budget',
    label: 'Monthly dollar budget',
    description: 'Hard cap on billed spend per workspace per month.',
    unit: 'usd/month'
  },
  {
    id: 'max_output_tokens',
    label: 'Max output tokens',
    description: 'Per-request cap on output tokens.',
    unit: 'tokens'
  },
  {
    id: 'max_build_repair_attempts',
    label: 'Max build repair attempts',
    description: 'How many auto-repair loops BrokCode can run per build.',
    unit: 'attempts'
  }
]
