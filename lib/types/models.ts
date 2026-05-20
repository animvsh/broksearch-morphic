export interface Model {
  id: string
  alias?: string
  name: string
  provider: string
  providerId: string
  description?: string
  contextWindow?: number
  outputTokens?: number
  speedLabel?: string
  providerOptions?: Record<string, any>
}
