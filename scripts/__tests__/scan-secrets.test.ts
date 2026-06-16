import { describe, expect, it } from 'vitest'

import { formatFindings, scanFileContent } from '../secret-scan-core'

describe('secret scanner', () => {
  it('allows documented placeholders and local smoke examples', () => {
    const findings = scanFileContent(
      '.env.local.example',
      [
        'OPENAI_API_KEY=[YOUR_OPENAI_API_KEY]',
        'SMOKE_SEED_TOKEN=...',
        'BROK_API_KEY=brok_sk_local_smoke',
        'DATABASE_URL=postgresql://user:password@localhost:5432/brok'
      ].join('\n')
    )

    expect(findings).toEqual([])
  })

  it('flags high-confidence provider tokens without formatting the value', () => {
    const secret = 'sk-proj-' + 'a'.repeat(40)
    const findings = scanFileContent('docs/leak.md', `OPENAI_API_KEY=${secret}`)

    expect(findings).toEqual([
      { file: 'docs/leak.md', line: 1, rule: 'openai-api-key' },
      { file: 'docs/leak.md', line: 1, rule: 'suspicious-env-assignment' }
    ])
    expect(formatFindings(findings)).not.toContain(secret)
  })

  it('flags real-looking remote database URLs', () => {
    const findings = scanFileContent(
      'docs/deploy.md',
      'DATABASE_URL=postgresql://app_user:super-secret-value@prod-db.internal:5432/brok'
    )

    expect(findings).toEqual([
      {
        file: 'docs/deploy.md',
        line: 1,
        rule: 'suspicious-env-assignment'
      }
    ])
  })
})
