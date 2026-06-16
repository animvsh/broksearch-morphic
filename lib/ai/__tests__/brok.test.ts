import { afterEach, describe, expect, it, vi } from 'vitest'

const originalModel = process.env.BROK_PROVIDER_MODEL

async function loadBrokProviderSettings() {
  vi.resetModules()
  return import('@/lib/ai/brok')
}

describe('Brok provider settings', () => {
  afterEach(() => {
    if (originalModel === undefined) {
      delete process.env.BROK_PROVIDER_MODEL
    } else {
      process.env.BROK_PROVIDER_MODEL = originalModel
    }
    vi.resetModules()
  })

  it('defaults answer synthesis to the highspeed provider model', async () => {
    delete process.env.BROK_PROVIDER_MODEL

    const { BROK_PROVIDER_CHAT_MODEL, BROK_PROVIDER_MODEL } =
      await loadBrokProviderSettings()

    expect(BROK_PROVIDER_MODEL).toBe('MiniMax-M2.7-highspeed')
    expect(BROK_PROVIDER_CHAT_MODEL).toBe('MiniMax-M2.7-highspeed')
  })

  it('keeps explicit provider model overrides intact', async () => {
    process.env.BROK_PROVIDER_MODEL = 'MiniMax-M2.7'

    const { BROK_PROVIDER_CHAT_MODEL, BROK_PROVIDER_MODEL } =
      await loadBrokProviderSettings()

    expect(BROK_PROVIDER_MODEL).toBe('MiniMax-M2.7')
    expect(BROK_PROVIDER_CHAT_MODEL).toBe('MiniMax-M2.7')
  })
})
