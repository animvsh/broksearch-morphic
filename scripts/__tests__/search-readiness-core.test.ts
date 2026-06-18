import { describe, expect, it } from 'vitest'

import {
  collectAnswer,
  collectFollowUps,
  parseSseEvents,
  qualityErrors,
  sessionContractErrors,
  sourceEvents
} from '../search-readiness-core'

describe('search readiness core helpers', () => {
  it('parses SSE events and collects answer/follow-up payloads', () => {
    const raw = [
      'event: status',
      'data: {"message":"Searching"}',
      '',
      'event: answer_delta',
      'data: {"delta":"Brok answers with sources."}',
      '',
      'event: follow_ups',
      'data: {"items":[{"label":"Go deeper","query":"More"}]}',
      '',
      'data: [DONE]',
      ''
    ].join('\n')

    const events = parseSseEvents(raw)

    expect(events.map(event => event.event)).toEqual([
      'status',
      'answer_delta',
      'follow_ups',
      'message'
    ])
    expect(collectAnswer(events)).toBe('Brok answers with sources.')
    expect(collectFollowUps(events)).toHaveLength(1)
  })

  it('reports missing session contract events', () => {
    const raw = [
      'event: status',
      'data: {"message":"Searching"}',
      '',
      'event: done',
      'data: {"usage":{}}',
      ''
    ].join('\n')

    expect(sessionContractErrors(parseSseEvents(raw), raw)).toEqual([
      'missing query_resolved event',
      'missing search_started event',
      'missing terminal [DONE] frame'
    ])
  })

  it('passes quality checks when sources, follow-ups, answer, and latency exist', () => {
    const events = parseSseEvents(
      [
        'event: source',
        'data: {"url":"https://example.com"}',
        '',
        'event: citation',
        'data: {"url":"https://example.com"}',
        ''
      ].join('\n')
    )

    expect(
      qualityErrors({
        answer:
          'Brok Search returns a concise answer, attaches citations, and offers next useful questions for the user to continue.',
        sourceEvents: sourceEvents(events),
        followUpItems: [{ label: 'Go deeper', query: 'Go deeper' }],
        latencyMs: 100
      })
    ).toEqual([])
  })

  it('flags weak completed runs', () => {
    const errors = qualityErrors({
      answer: 'too short',
      sourceEvents: [],
      followUpItems: [],
      latencyMs: 31_000
    })

    expect(errors).toContain('answer was too short to prove product quality')
    expect(errors).toContain('no source/citation events were emitted')
    expect(errors).toContain('no follow-up suggestions were emitted')
    expect(errors).toContain('latency 31000ms exceeded 30000ms')
  })
})
