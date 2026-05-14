export type HumanizerResult = {
  output: string
  detectedPatterns: string[]
  changes: string[]
}

type Rule = {
  name: string
  test: RegExp
  apply: (text: string) => string
  change: string
}

const replacementPairs: Array<[RegExp, string, string]> = [
  [/\bin order to\b/gi, 'to', 'shortened filler phrasing'],
  [/\bdue to the fact that\b/gi, 'because', 'shortened filler phrasing'],
  [/\butilize\b/gi, 'use', 'replaced stiff vocabulary'],
  [/\bleverage\b/gi, 'use', 'replaced stiff vocabulary'],
  [/\badditionally\b/gi, 'also', 'replaced AI-style connector'],
  [/\bserves as\b/gi, 'is', 'used direct verbs'],
  [/\bboasts\b/gi, 'has', 'used direct verbs'],
  [/\bshowcases\b/gi, 'shows', 'used direct verbs'],
  [/\bseamless\b/gi, 'smooth', 'replaced generic product adjective'],
  [/\brobust\b/gi, 'solid', 'replaced generic product adjective'],
  [/\btransformative\b/gi, 'useful', 'reduced inflated wording'],
  [/\bpivotal\b/gi, 'important', 'reduced inflated wording'],
  [/\bgreat question!?\s*/gi, '', 'removed chatbot opener'],
  [
    /\bin today'?s rapidly evolving technological landscape\b/gi,
    '',
    'removed stock AI phrase'
  ],
  [/\bat its core,?\s*/gi, '', 'removed signposting'],
  [/\blet'?s dive in\.?\s*/gi, '', 'removed chatbot signposting'],
  [/\bi hope this helps!?/gi, '', 'removed chatbot closer'],
  [
    /\blet me know if you(?:'|’)d like(?: me)? to (?:expand|help).*$/gim,
    '',
    'removed chatbot closer'
  ]
]

const rules: Rule[] = [
  {
    name: 'Emoji markers',
    test: /[\u{1F300}-\u{1FAFF}]/u,
    apply: text => text.replace(/[\u{1F300}-\u{1FAFF}]/gu, ''),
    change: 'removed emoji markers'
  },
  {
    name: 'Em dash overuse',
    test: /—/,
    apply: text => text.replace(/\s*—\s*/g, ', '),
    change: 'replaced em dashes with lighter punctuation'
  },
  {
    name: 'Markdown bolding',
    test: /\*\*[^*]+\*\*/,
    apply: text => text.replace(/\*\*([^*]+)\*\*/g, '$1'),
    change: 'removed unnecessary boldface'
  },
  {
    name: 'Negative parallelism',
    test: /not just\b[\s\S]{0,120}\bit(?:'|’)s\b/i,
    apply: text =>
      text.replace(
        /\b[Ii]t(?:'|’)s not just ([^.;:\n]+)[,;:]?\s*it(?:'|’)s ([^.;\n]+)[.;]?/g,
        (_match, _first, second) => String(second).trim() + '.'
      ),
    change: 'made contrast phrasing direct'
  },
  {
    name: 'Generic conclusion',
    test: /\b(the future looks bright|exciting times lie ahead)\b/i,
    apply: text =>
      text.replace(
        /\b(the future looks bright|exciting times lie ahead)\.?\s*/gi,
        ''
      ),
    change: 'removed generic conclusion'
  },
  {
    name: 'Filler vocabulary',
    test: new RegExp(
      replacementPairs.map(([pattern]) => pattern.source).join('|'),
      'i'
    ),
    apply: text =>
      replacementPairs.reduce(
        (current, [pattern, replacement]) =>
          current.replace(pattern, replacement),
        text
      ),
    change: 'trimmed AI-sounding filler and inflated vocabulary'
  },
  {
    name: 'Excess blank lines',
    test: /\n{3,}/,
    apply: text => text.replace(/\n{3,}/g, '\n\n'),
    change: 'tightened spacing'
  }
]

function lightlyMatchVoice(text: string, voiceSample?: string) {
  const sample = voiceSample?.trim()
  if (!sample) return text

  const contractions =
    /\b(I'|I'm|you're|it's|that's|don't|can't|won't)\b/i.test(sample)
  if (!contractions) return text

  return text
    .replace(/\bdo not\b/gi, "don't")
    .replace(/\bcannot\b/gi, "can't")
    .replace(/\bit is\b/gi, "it's")
    .replace(/\bthat is\b/gi, "that's")
}

export function humanizeText(
  input: string,
  voiceSample?: string
): HumanizerResult {
  const detectedPatterns: string[] = []
  const changes = new Set<string>()
  let output = input.trim()

  for (const rule of rules) {
    if (!rule.test.test(output)) continue
    detectedPatterns.push(rule.name)
    changes.add(rule.change)
    output = rule.apply(output)
  }

  output = output
    .split('\n')
    .map(line => line.replace(/[ \t]+$/g, '').replace(/^[ \t]+[-*]\s+$/g, ''))
    .join('\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\ba important\b/gi, 'an important')
    .replace(/\ba enduring\b/gi, 'an enduring')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim()

  output = lightlyMatchVoice(output, voiceSample)

  return {
    output,
    detectedPatterns,
    changes: [...changes]
  }
}
