import { describe, expect, it } from 'vitest'

import {
  getConnectorToolkitDefinition,
  getConnectorToolkitEnvKeys,
  normalizeConnectorToolkit
} from '../toolkit-registry'

describe('connector toolkit registry', () => {
  it('normalizes Google Slides aliases', () => {
    expect(normalizeConnectorToolkit('slides')).toBe('googleslides')
    expect(normalizeConnectorToolkit('google-slides')).toBe('googleslides')
    expect(normalizeConnectorToolkit('presentation')).toBe('googleslides')
    expect(normalizeConnectorToolkit('deck')).toBe('googleslides')
  })

  it('exposes Google Slides env keys', () => {
    expect(getConnectorToolkitEnvKeys('slides')).toContain(
      'COMPOSIO_GOOGLESLIDES_AUTH_CONFIG_ID'
    )
  })

  it('marks Slides create actions as mutating', () => {
    const definition = getConnectorToolkitDefinition('slides')

    expect(definition?.mutatingActions).toContain('create')
    expect(definition?.readActions).toContain('read')
  })
})
