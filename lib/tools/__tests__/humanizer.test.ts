import { describe, expect, test } from 'vitest'

import { humanizeText } from '../humanizer'

describe('humanizeText', () => {
  test('removes common AI-writing artifacts while preserving the core meaning', () => {
    const result = humanizeText(
      "Great question! AI-assisted coding serves as an enduring testament to the transformative potential of large language models. It's not just about autocomplete; it's about unlocking creativity at scale. I hope this helps!"
    )

    expect(result.output).not.toMatch(/Great question|I hope this helps/i)
    expect(result.output).not.toContain('serves as')
    expect(result.output).toContain('AI-assisted coding')
    expect(result.detectedPatterns).toContain('Filler vocabulary')
    expect(result.detectedPatterns).toContain('Negative parallelism')
  })

  test('lightly matches a contraction-heavy voice sample', () => {
    const result = humanizeText(
      'It is useful, but you cannot use it to avoid reviewing the code.',
      "I'm direct because that's how I write. Don't overdo it."
    )

    expect(result.output).toContain("it's useful")
    expect(result.output).toContain("can't use it")
  })
})
