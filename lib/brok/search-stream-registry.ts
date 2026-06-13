import { generateId } from '@/lib/db/schema'

export type SearchStreamMode = 'search' | 'deep' | 'quick'

export type SearchStreamRequest = {
  thread?: {
    id: string
    userId: string
    userMessageId: string
  }
  body: {
    query: string
    model: string
    stream: true
    depth: string
    recency_days?: number
    domains?: string[]
    mode?: SearchStreamMode
  }
  createdAt: number
  headers: {
    xApiKey?: string
    authorization?: string
  }
}

const REGISTRY_TTL_MS = 10 * 60 * 1000

type RegistryMap = Map<string, SearchStreamRequest>

const registry =
  (globalThis as { __brokSearchStreamRegistry?: RegistryMap })
    .__brokSearchStreamRegistry || new Map<string, SearchStreamRequest>()

if (
  !(globalThis as { __brokSearchStreamRegistry?: RegistryMap })
    .__brokSearchStreamRegistry
) {
  ;(
    globalThis as { __brokSearchStreamRegistry?: RegistryMap }
  ).__brokSearchStreamRegistry = registry
}

function pruneExpired() {
  const now = Date.now()
  for (const [messageId, request] of registry.entries()) {
    if (now - request.createdAt > REGISTRY_TTL_MS) {
      registry.delete(messageId)
    }
  }
}

export function makeSearchThreadId() {
  return `thr_${generateId()}`
}

export function makeSearchMessageId() {
  return `msg_${generateId()}`
}

export function registerSearchStreamRequest(request: SearchStreamRequest) {
  pruneExpired()
  const messageId = makeSearchMessageId()
  registry.set(messageId, request)
  return messageId
}

export function getSearchStreamRequest(messageId: string) {
  pruneExpired()
  return registry.get(messageId)
}
