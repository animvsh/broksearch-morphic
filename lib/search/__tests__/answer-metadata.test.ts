import { describe, expect, test } from 'vitest'

import type { UIMessage } from '@/lib/types/ai'

import { extractAnswerMetadata } from '../answer-metadata'

describe('extractAnswerMetadata', () => {
  test('extracts deduped sources, citations, and generated follow-ups', () => {
    const message: UIMessage = {
      id: 'answer_1',
      role: 'assistant',
      parts: [
        {
          type: 'tool-search',
          toolCallId: 'search_1',
          input: { query: 'brok citations' },
          state: 'output-available',
          output: {
            state: 'complete',
            citationMap: {
              1: {
                title: 'Original source',
                url: 'https://example.com/report?utm_source=brok#top',
                content: 'Source excerpt'
              },
              2: {
                title: 'Duplicate source',
                url: 'https://example.com/report',
                content: 'Duplicate excerpt'
              }
            }
          }
        } as any,
        {
          type: 'text',
          text: `Answer with a citation [1](#search_1:1).

\`\`\`spec
{"op":"add","path":"/root","value":"main"}
{"op":"add","path":"/elements/main","value":{"type":"Stack","props":{},"children":["q1"]}}
{"op":"add","path":"/elements/q1","value":{"type":"Button","props":{"text":"How does Brok rank sources?","variant":"link","icon":"arrow-right"},"on":{"press":{"action":"submitQuery","params":{"query":"How does Brok rank sources?"}}},"children":[]}}
\`\`\``
        }
      ]
    }

    expect(extractAnswerMetadata(message)).toEqual({
      sources: [
        {
          title: 'Original source',
          url: 'https://example.com/report?utm_source=brok#top',
          content: 'Source excerpt'
        }
      ],
      citationCount: 1,
      followUps: [
        {
          id: 'answer_1:follow_up:1',
          label: 'How does Brok rank sources?',
          query: 'How does Brok rank sources?'
        }
      ]
    })
  })
})
