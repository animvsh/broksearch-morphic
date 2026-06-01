import { describe, expect, it } from 'vitest'

import {
  getToolFeature,
  resolveFeatureSlug,
  TOOL_FEATURES
} from '../tool-feature-page'

describe('tool feature slugs', () => {
  it('resolves legacy aliases to canonical feature slugs', () => {
    expect(resolveFeatureSlug('app-builder')).toBe('brokcode')
    expect(resolveFeatureSlug('brok-presentations')).toBe('presentations')
    expect(resolveFeatureSlug('presentation')).toBe('presentations')
    expect(resolveFeatureSlug('code')).toBe('brokcode')
    expect(resolveFeatureSlug('brokcode')).toBe('brokcode')
  })

  it('returns canonical feature objects for alias lookups', () => {
    expect(getToolFeature('app-builder')?.slug).toBe('brokcode')
    expect(getToolFeature('brok-presentations')?.slug).toBe('presentations')
    expect(getToolFeature('presentation')?.slug).toBe('presentations')
  })

  it('keeps all feature slugs valid', () => {
    expect(TOOL_FEATURES.every(feature => feature.slug)).toBe(true)
  })
})
