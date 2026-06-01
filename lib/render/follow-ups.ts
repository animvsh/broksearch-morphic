import type { UIMessage } from '@/lib/types/ai'

import { parseSpecBlock } from './parse-spec-block'

export type ExtractedFollowUp = {
  id: string
  label: string
  query: string
}

function specBlocksFromText(text: string) {
  return [...text.matchAll(/```spec\s*([\s\S]*?)```/g)].map(match =>
    match[1].trim()
  )
}

function getSubmitQuery(element: any) {
  const press = element?.on?.press
  if (press?.action !== 'submitQuery') return null

  const query = press.params?.query
  if (typeof query !== 'string' || query.trim().length === 0) return null

  const label =
    typeof element.props?.text === 'string' && element.props.text.trim()
      ? element.props.text.trim()
      : query.trim()

  return { label, query: query.trim() }
}

export function extractFollowUpsFromText(
  text: string,
  answerId: string
): ExtractedFollowUp[] {
  const seen = new Set<string>()
  const followUps: ExtractedFollowUp[] = []

  for (const block of specBlocksFromText(text)) {
    try {
      const spec = parseSpecBlock(block)

      for (const element of Object.values(spec.elements ?? {})) {
        const followUp = getSubmitQuery(element)
        if (!followUp || seen.has(followUp.query)) continue

        seen.add(followUp.query)
        followUps.push({
          id: `${answerId}:follow_up:${followUps.length + 1}`,
          ...followUp
        })
      }
    } catch {
      continue
    }
  }

  return followUps
}

export function extractFollowUpsFromMessage(
  message: UIMessage
): ExtractedFollowUp[] {
  return (message.parts ?? [])
    .filter(
      (part): part is { type: 'text'; text: string } =>
        part.type === 'text' && typeof (part as any).text === 'string'
    )
    .flatMap(part => extractFollowUpsFromText(part.text, message.id))
}
