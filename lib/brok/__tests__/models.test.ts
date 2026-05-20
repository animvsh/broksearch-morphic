import { describe, expect, it } from 'vitest'

import { BROK_MODELS } from '@/lib/brok/models'

describe('Brok model capabilities', () => {
  it('exposes Brok Fast as the primary highspeed model alias', () => {
    expect(BROK_MODELS['brok-fast']).toMatchObject({
      name: 'Brok Fast',
      providerModel: 'MiniMax-M2.7-highspeed',
      supportsStreaming: true,
      supportsSearch: true,
      supportsTools: true,
      supportsCode: true
    })
  })

  it('keeps Brok Lite on the highspeed model while allowing web search tools', () => {
    expect(BROK_MODELS['brok-lite']).toMatchObject({
      providerModel: 'MiniMax-M2.7-highspeed',
      supportsStreaming: true,
      supportsSearch: true,
      supportsTools: true
    })
  })
})
