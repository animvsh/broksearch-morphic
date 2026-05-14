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
  [/\bat the end of the day,?\s*/gi, '', 'removed filler phrasing'],
  [/\butilize\b/gi, 'use', 'replaced stiff vocabulary'],
  [/\bleverage\b/gi, 'use', 'replaced stiff vocabulary'],
  [/\bfoster\b/gi, 'build', 'replaced stiff vocabulary'],
  [/\benhance\b/gi, 'improve', 'replaced stiff vocabulary'],
  [/\bstreamline\b/gi, 'simplify', 'replaced stiff vocabulary'],
  [/\badditionally\b/gi, 'also', 'replaced AI-style connector'],
  [/\bfurthermore\b/gi, 'also', 'replaced AI-style connector'],
  [/\bmoreover\b/gi, 'also', 'replaced AI-style connector'],
  [/\bserves as\b/gi, 'is', 'used direct verbs'],
  [/\bfunctions as\b/gi, 'is', 'used direct verbs'],
  [/\bboasts\b/gi, 'has', 'used direct verbs'],
  [/\bshowcases\b/gi, 'shows', 'used direct verbs'],
  [/\bunderscores\b/gi, 'shows', 'used direct verbs'],
  [/\bseamless\b/gi, 'smooth', 'replaced generic product adjective'],
  [/\brobust\b/gi, 'solid', 'replaced generic product adjective'],
  [/\bpowerful\b/gi, 'useful', 'replaced generic product adjective'],
  [/\bgroundbreaking\b/gi, 'new', 'reduced inflated wording'],
  [/\btransformative\b/gi, 'useful', 'reduced inflated wording'],
  [/\bpivotal\b/gi, 'important', 'reduced inflated wording'],
  [/\benduring testament to\b/gi, 'example of', 'reduced inflated wording'],
  [/\bintricate interplay\b/gi, 'relationship', 'reduced inflated wording'],
  [/\bgreat question!?\s*/gi, '', 'removed chatbot opener'],
  [/\byou'?re absolutely right[!.]?\s*/gi, '', 'removed sycophantic phrasing'],
  [
    /\bin today'?s rapidly evolving technological landscape\b/gi,
    '',
    'removed stock AI phrase'
  ],
  [/\bnestled within\b/gi, 'in', 'removed promotional language'],
  [/\bat its core,?\s*/gi, '', 'removed signposting'],
  [
    /\b(?:here'?s|here is) what you need to know:?\s*/gi,
    '',
    'removed signposting'
  ],
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
    name: 'Curly quotes',
    test: /[“”‘’]/,
    apply: text => text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'"),
    change: 'normalized curly quotes'
  },
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
    name: 'Fragmented headings',
    test: /^#{1,6}\s+[A-Z][A-Za-z\s-]+$/m,
    apply: text =>
      text.replace(/^#{1,6}\s+(.+)$/gm, (_match, heading) =>
        String(heading)
          .trim()
          .replace(/\b(And|Or|The|A|An|Of|For|To|In)\b/g, word =>
            word.toLowerCase()
          )
      ),
    change: 'softened over-formatted headings'
  },
  {
    name: 'Inline-header lists',
    test: /^\s*(?:[-*]\s*)?[A-Z][A-Za-z ]{2,24}:\s+/m,
    apply: text =>
      text.replace(
        /^\s*(?:[-*]\s*)?([A-Z][A-Za-z ]{2,24}):\s+/gm,
        (_match, label) => `${String(label).trim()}: `
      ),
    change: 'cleaned inline list headers'
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
    name: 'Rule of three',
    test: /\b\w+,\s+\w+,\s+and\s+\w+\b/,
    apply: text =>
      text.replace(
        /\b(streamlining|enhancing|fostering) ([^,.;]+),\s+(enhancing|fostering|streamlining) ([^,.;]+),\s+and\s+(fostering|enhancing|streamlining) ([^.;]+)/gi,
        (_match, verbA, nounA, _verbB, nounB) =>
          `${String(verbA).toLowerCase()} ${String(nounA).trim()} and ${String(nounB).trim()}`
      ),
    change: 'reduced formulaic three-part phrasing'
  },
  {
    name: 'Vague attribution',
    test: /\b(experts believe|industry observers have noted|some say|it is widely believed)\b/i,
    apply: text =>
      text.replace(
        /\b(experts believe|industry observers have noted|some say|it is widely believed)(?: that)?\s*/gi,
        ''
      ),
    change: 'removed vague attribution'
  },
  {
    name: 'Excessive hedging',
    test: /\b(could potentially possibly|could potentially|might possibly|it could be argued that)\b/i,
    apply: text =>
      text
        .replace(/\bcould potentially possibly\b/gi, 'may')
        .replace(/\bcould potentially\b/gi, 'may')
        .replace(/\bmight possibly\b/gi, 'may')
        .replace(/\bit could be argued that\s*/gi, ''),
    change: 'tightened hedging'
  },
  {
    name: 'Cutoff disclaimer',
    test: /\b(while details are limited|based on available information|specific details are limited)\b/i,
    apply: text =>
      text.replace(
        /\b(while details are limited|based on available information|specific details are limited),?\s*/gi,
        ''
      ),
    change: 'removed unsupported disclaimer'
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
