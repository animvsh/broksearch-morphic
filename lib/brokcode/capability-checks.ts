import type { BrokCodeAcceptanceCase } from './acceptance-matrix'

export type BrokCodeCapabilityFile = {
  path: string
  content: string
}

export function verifyNamedCapabilities(
  files: BrokCodeCapabilityFile[],
  testCase: BrokCodeAcceptanceCase
) {
  const combined = files
    .map(file => `${file.path}\n${file.content}`)
    .join('\n')
    .toLowerCase()
  const requirePattern = (name: string, pattern: RegExp) => {
    if (!pattern.test(combined)) {
      throw new Error(`missing ${testCase.id} capability: ${name}`)
    }
    return `capability-${name}`
  }

  switch (testCase.category) {
    case 'crud':
      return [
        requirePattern('create-record', /\b(add|create|new)\b/),
        requirePattern('update-record', /\b(edit|update|save)\b/),
        requirePattern('delete-record', /\b(delete|remove)\b/),
        requirePattern('local-storage', /localstorage/)
      ]
    case 'form_workflow':
      return [
        requirePattern('validation', /\b(validate|required|error|invalid)\b/),
        requirePattern('review-state', /\breview\b/),
        requirePattern('confirmation-state', /\b(confirm|submitted|success)\b/)
      ]
    case 'mobile_utility':
      return [
        requirePattern('mobile-layout', /\bviewport\b|@media|max-width/),
        requirePattern(
          'timer-or-checklist',
          /\btimer|checklist|checkbox|task\b/
        )
      ]
    case 'backend_backed':
      return [
        requirePattern('mock-feedback-data', /api\/mock-feedback\.json/),
        requirePattern('feedback-feed', /\bfeedback\b/),
        requirePattern('submit-flow', /\bsubmit\b/),
        requirePattern('loading-state', /\bloading\b/),
        requirePattern('error-state', /\berror\b/),
        requirePattern(
          'persisted-data-simulation',
          /\bfetch|localstorage|mock-feedback\b/
        )
      ]
    case 'dashboard':
      return [
        requirePattern('filter-control', /\bfilter|select|search\b/),
        requirePattern('dashboard-cards', /\bcard|deadline|advisor\b/)
      ]
    case 'landing':
      return [
        requirePattern('newsletter-form', /\bnewsletter|email|subscribe\b/)
      ]
    default:
      return []
  }
}
