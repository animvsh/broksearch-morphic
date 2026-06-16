import { describe, expect, it } from 'vitest'

import { hashIdempotencyRequest } from '../idempotency'

describe('hashIdempotencyRequest', () => {
  it('hashes logically equivalent JSON bodies independent of object key order', () => {
    const first = hashIdempotencyRequest({
      route: '/api/v1/chat/completions',
      stream: false,
      body: {
        model: 'brok-code',
        messages: [
          {
            role: 'user',
            content: 'hello'
          }
        ],
        options: {
          temperature: 0.2,
          top_p: 1
        }
      }
    })

    const second = hashIdempotencyRequest({
      route: '/api/v1/chat/completions',
      stream: false,
      body: {
        options: {
          top_p: 1,
          temperature: 0.2
        },
        messages: [
          {
            content: 'hello',
            role: 'user'
          }
        ],
        model: 'brok-code'
      }
    })

    expect(second).toBe(first)
  })

  it('keeps stream mode in the hash so streaming and non-streaming calls cannot collide', () => {
    const body = {
      model: 'brok-code',
      messages: [{ role: 'user', content: 'hello' }]
    }

    expect(
      hashIdempotencyRequest({
        route: '/api/v1/chat/completions',
        stream: true,
        body
      })
    ).not.toBe(
      hashIdempotencyRequest({
        route: '/api/v1/chat/completions',
        stream: false,
        body
      })
    )
  })
})
