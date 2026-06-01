import { describe, expect, test } from 'vitest'

import { extractFollowUpsFromText } from '../follow-ups'

describe('extractFollowUpsFromText', () => {
  test('extracts submitQuery buttons from related-question spec blocks', () => {
    const text = `Answer text.

\`\`\`spec
{"op":"add","path":"/root","value":"main"}
{"op":"add","path":"/elements/main","value":{"type":"Stack","props":{"direction":"vertical"},"children":["heading","q1","q2"]}}
{"op":"add","path":"/elements/heading","value":{"type":"Heading","props":{"title":"Related","icon":"related"},"children":[]}}
{"op":"add","path":"/elements/q1","value":{"type":"Button","props":{"text":"How does Brok pick sources?","variant":"link","icon":"arrow-right"},"on":{"press":{"action":"submitQuery","params":{"query":"How does Brok pick sources?"}}},"children":[]}}
{"op":"add","path":"/elements/q2","value":{"type":"Button","props":{"text":"What should the API playground include?","variant":"link","icon":"arrow-right"},"on":{"press":{"action":"submitQuery","params":{"query":"What should the API playground include?"}}},"children":[]}}
\`\`\``

    expect(extractFollowUpsFromText(text, 'answer_1')).toEqual([
      {
        id: 'answer_1:follow_up:1',
        label: 'How does Brok pick sources?',
        query: 'How does Brok pick sources?'
      },
      {
        id: 'answer_1:follow_up:2',
        label: 'What should the API playground include?',
        query: 'What should the API playground include?'
      }
    ])
  })

  test('ignores invalid spec blocks and duplicate queries', () => {
    const text = `
\`\`\`spec
not json
\`\`\`

\`\`\`spec
{"op":"add","path":"/root","value":"main"}
{"op":"add","path":"/elements/main","value":{"type":"Stack","props":{},"children":["q1","q2"]}}
{"op":"add","path":"/elements/q1","value":{"type":"Button","props":{"text":"First label","variant":"link"},"on":{"press":{"action":"submitQuery","params":{"query":"Same query"}}},"children":[]}}
{"op":"add","path":"/elements/q2","value":{"type":"Button","props":{"text":"Second label","variant":"link"},"on":{"press":{"action":"submitQuery","params":{"query":"Same query"}}},"children":[]}}
\`\`\``

    expect(extractFollowUpsFromText(text, 'answer_2')).toEqual([
      {
        id: 'answer_2:follow_up:1',
        label: 'First label',
        query: 'Same query'
      }
    ])
  })
})
