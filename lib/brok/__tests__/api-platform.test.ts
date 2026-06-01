import { describe, expect, it } from 'vitest'

import {
  validateApiKeyStatusTransition,
  validateCreateApiKeyInput
} from '../api-platform'

const validInput = {
  name: ' Production app ',
  environment: 'live' as const,
  scopes: ['chat:write', 'search:write', 'chat:write'],
  allowedModels: ['brok-search', 'brok-lite', 'brok-search'],
  rpmLimit: 60,
  dailyRequestLimit: 5000,
  monthlyBudgetCents: 2000
}

describe('validateCreateApiKeyInput', () => {
  it('normalizes a valid API key creation request', () => {
    expect(validateCreateApiKeyInput(validInput)).toEqual({
      name: 'Production app',
      environment: 'live',
      scopes: ['chat:write', 'search:write'],
      allowedModels: ['brok-search', 'brok-lite'],
      rpmLimit: 60,
      dailyRequestLimit: 5000,
      monthlyBudgetCents: 2000
    })
  })

  it('requires at least one supported scope', () => {
    expect(() =>
      validateCreateApiKeyInput({ ...validInput, scopes: [] })
    ).toThrow('Select at least one API key scope.')

    expect(() =>
      validateCreateApiKeyInput({
        ...validInput,
        scopes: ['chat:write', 'admin:write']
      })
    ).toThrow('Unsupported API key scopes: admin:write.')
  })

  it('rejects unsupported environments', () => {
    expect(() =>
      validateCreateApiKeyInput({
        ...validInput,
        environment: 'preview' as 'live'
      })
    ).toThrow('API key environment must be test or live.')
  })

  it('rejects unsupported model allowlists', () => {
    expect(() =>
      validateCreateApiKeyInput({
        ...validInput,
        allowedModels: ['brok-search', 'unknown-model']
      })
    ).toThrow('Unsupported Brok models: unknown-model.')
  })

  it('rejects unsafe request and budget limits', () => {
    expect(() =>
      validateCreateApiKeyInput({ ...validInput, rpmLimit: 0 })
    ).toThrow('Requests per minute must be an integer between 1 and 1000.')

    expect(() =>
      validateCreateApiKeyInput({ ...validInput, dailyRequestLimit: 100001 })
    ).toThrow('Daily request limit must be an integer between 1 and 100000.')

    expect(() =>
      validateCreateApiKeyInput({ ...validInput, monthlyBudgetCents: -1 })
    ).toThrow('Monthly budget must be an integer between 0 and 10000000.')
  })
})

describe('validateApiKeyStatusTransition', () => {
  it('allows supported API key lifecycle transitions', () => {
    expect(() =>
      validateApiKeyStatusTransition('active', 'pause')
    ).not.toThrow()
    expect(() =>
      validateApiKeyStatusTransition('paused', 'resume')
    ).not.toThrow()
    expect(() =>
      validateApiKeyStatusTransition('active', 'revoke')
    ).not.toThrow()
    expect(() =>
      validateApiKeyStatusTransition('paused', 'revoke')
    ).not.toThrow()
  })

  it('rejects lifecycle transitions that bypass the key state machine', () => {
    expect(() => validateApiKeyStatusTransition('paused', 'pause')).toThrow(
      'API key is already paused.'
    )
    expect(() => validateApiKeyStatusTransition('active', 'resume')).toThrow(
      'API key is already active.'
    )
    expect(() => validateApiKeyStatusTransition('revoked', 'pause')).toThrow(
      'Revoked API keys cannot be paused.'
    )
    expect(() => validateApiKeyStatusTransition('revoked', 'resume')).toThrow(
      'Revoked API keys cannot be resumed. Create a new key.'
    )
    expect(() => validateApiKeyStatusTransition('revoked', 'revoke')).toThrow(
      'API key is already revoked.'
    )
  })
})
