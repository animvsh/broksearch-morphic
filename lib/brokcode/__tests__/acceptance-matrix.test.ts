import { describe, expect, it } from 'vitest'

import {
  BROKCODE_ACCEPTANCE_MATRIX,
  getBrokCodeAcceptanceCases,
  matchesBrokCodeAcceptanceTerms
} from '../acceptance-matrix'

describe('BrokCode acceptance matrix', () => {
  it('covers the required generated app product types', () => {
    expect(
      BROKCODE_ACCEPTANCE_MATRIX.map(testCase => testCase.category)
    ).toEqual([
      'landing',
      'dashboard',
      'crud',
      'form_workflow',
      'mobile_utility',
      'backend_backed'
    ])
  })

  it('requires multi-file generated apps with concrete app copy', () => {
    for (const testCase of BROKCODE_ACCEPTANCE_MATRIX) {
      expect(testCase.minimumGeneratedFiles).toBeGreaterThanOrEqual(3)
      expect(testCase.prompt).toContain('Return named files')
      expect(testCase.expectedTerms.length).toBeGreaterThanOrEqual(3)
    }

    expect(
      BROKCODE_ACCEPTANCE_MATRIX.find(
        testCase => testCase.category === 'backend_backed'
      )?.minimumGeneratedFiles
    ).toBeGreaterThanOrEqual(4)
  })

  it('resolves selected cases and validates expected preview terms', () => {
    const cases = getBrokCodeAcceptanceCases([
      'landing-bakery',
      'mobile-study-planner'
    ])

    expect(cases.map(testCase => testCase.id)).toEqual([
      'landing-bakery',
      'mobile-study-planner'
    ])
    expect(
      matchesBrokCodeAcceptanceTerms(
        'A study planner with task chips and a timer',
        cases[1]
      )
    ).toBe(true)
    expect(
      matchesBrokCodeAcceptanceTerms(
        'A study planner with task chips',
        cases[1]
      )
    ).toBe(false)
  })
})
