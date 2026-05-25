import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@ai-sdk/anthropic', () => ({ anthropic: {} }))
vi.mock('@ai-sdk/gateway', () => ({ createGateway: vi.fn(() => ({})) }))
vi.mock('@ai-sdk/google', () => ({ google: {} }))
vi.mock('@ai-sdk/openai', () => ({ openai: {} }))
vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: vi.fn(() => ({}))
}))
vi.mock('ai', () => ({
  createProviderRegistry: vi.fn(() => ({ languageModel: vi.fn() }))
}))
vi.mock('ai-sdk-ollama', () => ({ createOllama: vi.fn(() => ({})) }))

async function loadRegistry() {
  vi.resetModules()
  return import('../registry')
}

describe('registry provider detection', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('enables the OpenAI-compatible provider with the default MiniMax base URL', async () => {
    vi.stubEnv('OPENAI_COMPATIBLE_API_KEY', 'test-key')
    vi.stubEnv('OPENAI_COMPATIBLE_API_BASE_URL', '')

    const { isProviderEnabled } = await loadRegistry()

    expect(isProviderEnabled('openai-compatible')).toBe(true)
  })

  it('accepts MINIMAX_API_KEY as the Brok provider key fallback', async () => {
    vi.stubEnv('OPENAI_COMPATIBLE_API_KEY', '')
    vi.stubEnv('MINIMAX_API_KEY', 'minimax-key')

    const { isProviderEnabled } = await loadRegistry()

    expect(isProviderEnabled('openai-compatible')).toBe(true)
  })

  it('disables the OpenAI-compatible provider without either key', async () => {
    vi.stubEnv('OPENAI_COMPATIBLE_API_KEY', '')
    vi.stubEnv('MINIMAX_API_KEY', '')

    const { isProviderEnabled } = await loadRegistry()

    expect(isProviderEnabled('openai-compatible')).toBe(false)
  })
})
