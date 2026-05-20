import { describe, expect, it } from 'vitest'

import {
  buildBrokCodeCommandPrompt,
  getBrokCodeGenerationSystemPrompt
} from '../generation-prompt'

describe('BrokCode generation prompts', () => {
  it('requires production-grade generated app files', () => {
    const prompt = getBrokCodeGenerationSystemPrompt()

    expect(prompt).toContain('not a generic demo shell')
    expect(prompt).toContain('modern light theme')
    expect(prompt).toContain('no horizontal overflow')
    expect(prompt).toContain('empty/loading/error states')
    expect(prompt).toContain('index.html, styles.css, and app.js')
    expect(prompt).toContain('Brok API compatible')
  })

  it('keeps browser builder prompts aligned with runtime prompts', () => {
    const prompt = buildBrokCodeCommandPrompt('Build a CRM')

    expect(prompt).toContain('not a generic demo shell')
    expect(prompt).toContain('User command: Build a CRM')
    expect(prompt).toContain('hot-reload the managed cloud preview')
  })
})
