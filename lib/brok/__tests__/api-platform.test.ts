import { describe, expect, it } from 'vitest'

import {
  validateAnthropicMessages,
  validateAnthropicSystem,
  validateApiKeyStatusTransition,
  validateCreateApiKeyInput,
  validateOpenAiChatMessages
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
      monthlyBudgetCents: 2000,
      expiresAt: null
    })
  })

  it('accepts bounded future expiration and rejects past expiration', () => {
    const future = new Date(Date.now() + 60 * 60 * 1000)
    expect(
      validateCreateApiKeyInput({
        ...validInput,
        expiresAt: future.toISOString()
      }).expiresAt?.toISOString()
    ).toBe(future.toISOString())

    expect(() =>
      validateCreateApiKeyInput({
        ...validInput,
        expiresAt: new Date(Date.now() - 60 * 1000).toISOString()
      })
    ).toThrow('API key expiration must be in the future.')
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

describe('validateOpenAiChatMessages', () => {
  it('accepts supported OpenAI-compatible chat roles', () => {
    expect(
      validateOpenAiChatMessages([
        { role: 'system', content: 'Be concise.' },
        { role: 'developer', content: 'Use citations.' },
        {
          role: 'user',
          content: [{ type: 'text', text: 'What is Brok?' }]
        },
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'lookup', arguments: '{}' }
            }
          ]
        },
        {
          role: 'tool',
          tool_call_id: 'call_1',
          content: 'tool result'
        }
      ])
    ).toEqual({ ok: true })
  })

  it('rejects empty and malformed chat messages', () => {
    expect(validateOpenAiChatMessages([])).toEqual({
      ok: false,
      code: 'missing_messages',
      message: 'messages must include at least one chat message.'
    })
    expect(validateOpenAiChatMessages(['hello'])).toEqual({
      ok: false,
      code: 'invalid_message',
      message: 'messages[0] must be an object.'
    })
    expect(validateOpenAiChatMessages([{ role: 'admin' }])).toEqual({
      ok: false,
      code: 'invalid_message_role',
      message:
        'messages[0].role must be one of system, developer, user, assistant, or tool.'
    })
    expect(validateOpenAiChatMessages([{ role: 'user', content: '' }])).toEqual(
      {
        ok: false,
        code: 'invalid_message_content',
        message: 'messages[0].content must not be empty.'
      }
    )
    expect(
      validateOpenAiChatMessages([
        { role: 'user', content: [{ type: 'text', text: '' }] }
      ])
    ).toEqual({
      ok: false,
      code: 'invalid_message_content_part',
      message: 'messages[0].content[0].text must be a non-empty string.'
    })
    expect(
      validateOpenAiChatMessages([
        { role: 'tool', content: 'result without id' }
      ])
    ).toEqual({
      ok: false,
      code: 'invalid_tool_message',
      message: 'messages[0].tool_call_id must be a non-empty string.'
    })
    expect(
      validateOpenAiChatMessages([
        { role: 'assistant', content: null, tool_calls: [{ id: 'call_1' }] }
      ])
    ).toEqual({
      ok: false,
      code: 'invalid_tool_calls',
      message: 'messages[0].tool_calls[0].type must be function.'
    })
  })
})

describe('validateAnthropicMessages', () => {
  it('accepts supported Anthropic-compatible message roles', () => {
    expect(
      validateAnthropicMessages([
        {
          role: 'user',
          content: [{ type: 'text', text: 'Build a dashboard' }]
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_1',
              name: 'create_file',
              input: {}
            }
          ]
        },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_1',
              content: 'done'
            }
          ]
        }
      ])
    ).toEqual({ ok: true })
  })

  it('rejects empty and malformed Anthropic messages', () => {
    expect(validateAnthropicMessages([])).toEqual({
      ok: false,
      code: 'missing_messages',
      message: 'messages must include at least one Anthropic message.'
    })
    expect(validateAnthropicMessages([null])).toEqual({
      ok: false,
      code: 'invalid_message',
      message: 'messages[0] must be an object.'
    })
    expect(validateAnthropicMessages([{ role: 'system' }])).toEqual({
      ok: false,
      code: 'invalid_message_role',
      message: 'messages[0].role must be user or assistant.'
    })
    expect(validateAnthropicMessages([{ role: 'user' }])).toEqual({
      ok: false,
      code: 'invalid_message_content',
      message:
        'messages[0].content must be a string or an array of content blocks.'
    })
    expect(
      validateAnthropicMessages([
        { role: 'user', content: [{ type: 'tool_result' }] }
      ])
    ).toEqual({
      ok: false,
      code: 'invalid_message_content_part',
      message: 'messages[0].content[0].tool_use_id must be a non-empty string.'
    })
  })
})

describe('validateAnthropicSystem', () => {
  it('accepts Anthropic system strings and text blocks', () => {
    expect(validateAnthropicSystem('You are Brok.')).toEqual({ ok: true })
    expect(
      validateAnthropicSystem([{ type: 'text', text: 'You are Brok.' }])
    ).toEqual({ ok: true })
  })

  it('rejects malformed Anthropic system content', () => {
    expect(validateAnthropicSystem('')).toEqual({
      ok: false,
      code: 'invalid_system',
      message: 'system must not be empty.'
    })
  })
})
