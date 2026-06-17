import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const command = 'node'
const script = 'scripts/check-api-platform-kery-proof.mjs'

describe('api platform Kery proof checker', () => {
  it('passes static Kery fixture checks without live GitHub access', () => {
    const output = execFileSync(command, [script], {
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_TOKEN: ''
      }
    })

    expect(output).toContain('PASS Kery task fixture contains kery-oss')
    expect(output).toContain('PASS README documents Kery proof and agent task')
    expect(output).toContain(
      'PASS agent manifest exposes kery-integration-plan command'
    )
    expect(output).toContain(
      'SKIP Live Kery repository proof skipped; pass --live to verify GitHub facts'
    )
  })
})
