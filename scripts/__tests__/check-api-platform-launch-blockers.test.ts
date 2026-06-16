import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const command = 'node'
const script = 'scripts/check-api-platform-launch-blockers.mjs'

describe('api platform launch blocker checker', () => {
  it('passes when repo-side launch blocker artifacts are present', () => {
    const output = execFileSync(command, [script], {
      encoding: 'utf8'
    })

    expect(output).toContain(
      'PASS file exists: docs/api-platform-launch-blockers.md'
    )
    expect(output).toContain('PASS package script exists: scan:secrets')
    expect(output).toContain('PASS package script exists: check:openapi')
    expect(output).toContain(
      'PASS file exists: docs/openapi/brok-v1.openapi.json'
    )
    expect(output).toContain('PASS file contains "BRO-182"')
    expect(output).toContain('PASS file contains "BRO-156"')
    expect(output).toContain(
      'PASS hosted playground does not send browser-supplied API keys'
    )
    expect(output).toContain('PASS hosted playground does not persist API keys')
    expect(output).toContain(
      'PASS BrokCode browser UI does not collect API keys'
    )
    expect(output).toContain(
      'PASS BrokCode browser UI does not read legacy stored API keys'
    )
  })

  it('fails external mode without printing secret values', () => {
    let output = ''

    try {
      execFileSync(command, [script, '--require-external'], {
        encoding: 'utf8',
        env: {
          ...process.env,
          SMOKE_BASE_URL: '',
          SMOKE_SEED_TOKEN: ''
        },
        stdio: ['ignore', 'pipe', 'pipe']
      })
    } catch (error) {
      const failure = error as {
        stdout?: Buffer | string
        stderr?: Buffer | string
      }
      output = `${failure.stdout ?? ''}${failure.stderr ?? ''}`
    }

    expect(output).toContain('FAIL external env configured: SMOKE_SEED_TOKEN')
    expect(output).toContain(
      'PASS external env configured: SMOKE_BASE_URL (default https://www.brok.fyi)'
    )
    expect(output).not.toContain('secret=')
    expect(output).not.toContain('token=')
  })

  it('passes external mode when seeded proof token is configured', () => {
    const output = execFileSync(command, [script, '--require-external'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        SMOKE_BASE_URL: '',
        SMOKE_SEED_TOKEN: 'seed-token-present'
      }
    })

    expect(output).toContain('PASS external env configured: SMOKE_SEED_TOKEN')
    expect(output).toContain(
      'PASS external env configured: SMOKE_BASE_URL (default https://www.brok.fyi)'
    )
    expect(output).not.toContain('seed-token-present')
  })
})
