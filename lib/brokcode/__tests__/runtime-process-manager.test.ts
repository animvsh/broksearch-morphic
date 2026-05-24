import { describe, expect, it } from 'vitest'

import {
  createRuntimeLogs,
  redactBrokCodeRuntimeLog
} from '../runtime/process-manager'

describe('BrokCode runtime process diagnostics', () => {
  it('redacts secrets from runtime logs', () => {
    expect(
      redactBrokCodeRuntimeLog(
        'OPENAI_API_KEY=sk-test token: abc123 password=hunter2'
      )
    ).toBe('OPENAI_API_KEY=[redacted] token=[redacted] password=[redacted]')
  })

  it('caps noisy log chunks and preserves clickable error context', () => {
    const logs = createRuntimeLogs({
      level: 'error',
      source: 'browser',
      message: `${'x'.repeat(2100)}\n${Array.from({ length: 60 }, (_, index) => `line ${index}`).join('\n')}`,
      file: '/src/App.tsx',
      line: 42,
      column: 7,
      stack: `Authorization: bearer-token\n${'s'.repeat(4200)}`
    })

    expect(logs).toHaveLength(40)
    expect(logs.at(-1)).toMatchObject({
      level: 'error',
      source: 'browser',
      file: '/src/App.tsx',
      line: 42,
      column: 7
    })
    expect(logs[0].message.length).toBeLessThanOrEqual(2003)
    expect(logs.at(-1)?.stack).toContain('Authorization=[redacted]')
    expect(logs.at(-1)?.stack?.length ?? 0).toBeLessThanOrEqual(4000)
  })
})
