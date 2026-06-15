import { NextRequest } from 'next/server'

import { upsertMessage } from '@/lib/actions/chat'
import { getSearchStreamRequest } from '@/lib/brok/search-stream-registry'
import { generateId } from '@/lib/db/schema'
import type { SearchResultItem } from '@/lib/types'
import type { UIMessageMetadata } from '@/lib/types/ai'

import { POST as postSearchCompletion } from '@/app/api/v1/search/completions/route'

export const runtime = 'nodejs'

type SearchCompletion = {
  citations?: SearchCompletionCitation[]
  follow_ups?: SearchCompletionFollowUp[]
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
}

type SearchCompletionCitation = {
  id?: string
  title?: string
  url?: string
  publisher?: string
  snippet?: string
  retrievedAt?: string
  qualityScore?: number
}

type SearchCompletionFollowUp = {
  id?: string
  label?: string
  query?: string
}

type SearchSourceEvent = {
  title?: string
  url?: string
  domain?: string
  snippet?: string
  retrieved_at?: string
}

type SearchFollowUpsEvent = {
  items?: SearchCompletionFollowUp[]
  follow_ups?: SearchCompletionFollowUp[]
}

type SearchStreamThread = {
  id: string
  userId: string
}

type ParsedSseFrame = {
  event: string
  data: string
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  const { messageId } = await params

  if (!messageId?.trim()) {
    return Response.json(
      {
        error: {
          type: 'invalid_request_error',
          code: 'missing_message_id',
          message: 'message_id is required.'
        }
      },
      { status: 400 }
    )
  }

  const storedRequest = getSearchStreamRequest(messageId)
  if (!storedRequest) {
    return Response.json(
      {
        error: {
          type: 'not_found',
          code: 'search_request_not_found',
          message: 'search stream request not found or expired.'
        }
      },
      { status: 404 }
    )
  }

  const headers = new Headers()
  headers.set('content-type', 'application/json')
  if (storedRequest.headers.xApiKey) {
    headers.set('x-api-key', storedRequest.headers.xApiKey)
  }
  if (storedRequest.headers.authorization) {
    headers.set('authorization', storedRequest.headers.authorization)
  }

  const forwarded = new NextRequest(
    new URL('/api/v1/search/completions', request.url),
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...storedRequest.body,
        stream: true
      })
    }
  )

  const response = await postSearchCompletion(forwarded)
  const thread = storedRequest.thread

  if (
    thread?.id &&
    thread?.userId &&
    response.body &&
    response.status === 200
  ) {
    return persistSearchStreamResponse(response, thread)
  }

  return response
}

function parseSseFrame(frame: string): ParsedSseFrame | null {
  const lines = frame.split(/\r?\n/)
  let event = 'message'
  const data: string[] = []

  for (const line of lines) {
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim()
      continue
    }

    if (line.startsWith('data:')) {
      data.push(line.slice('data:'.length).trimStart())
    }
  }

  if (data.length === 0) {
    return null
  }

  return {
    event,
    data: data.join('\n')
  }
}

function tryParseCompletionPayload(raw: string) {
  try {
    return JSON.parse(raw) as SearchCompletion
  } catch {
    return null
  }
}

function parseCompletionText(payload: SearchCompletion | null): string | null {
  return payload?.choices?.[0]?.message?.content ?? null
}

function sourceFromCitation(
  citation: SearchCompletionCitation
): SearchResultItem | null {
  if (!citation.url?.trim() || !citation.title?.trim()) {
    return null
  }

  const snippet = citation.snippet?.trim() ?? ''

  return {
    title: citation.title.trim(),
    url: citation.url.trim(),
    content: snippet,
    snippet,
    publisher: citation.publisher,
    retrievedAt: citation.retrievedAt,
    publishedDate: citation.retrievedAt,
    date: citation.retrievedAt
  }
}

function sourceFromEvent(source: SearchSourceEvent): SearchResultItem | null {
  if (!source.url?.trim() || !source.title?.trim()) {
    return null
  }

  const snippet = source.snippet?.trim() ?? ''

  return {
    title: source.title.trim(),
    url: source.url.trim(),
    content: snippet,
    snippet,
    publisher: source.domain,
    retrievedAt: source.retrieved_at,
    publishedDate: source.retrieved_at,
    date: source.retrieved_at
  }
}

function normalizeSourceKey(url: string) {
  try {
    const parsed = new URL(url)
    parsed.hash = ''
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (/^utm_/i.test(key) || key === 'ref' || key === 'fbclid') {
        parsed.searchParams.delete(key)
      }
    }
    return parsed.toString().replace(/\/$/, '')
  } catch {
    return url.trim()
  }
}

function dedupeSources(sources: SearchResultItem[]) {
  const seen = new Set<string>()

  return sources.filter(source => {
    const key = normalizeSourceKey(source.url)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function normalizeFollowUps(followUps: SearchCompletionFollowUp[] | undefined) {
  const seen = new Set<string>()

  return (followUps ?? [])
    .map((followUp, index) => {
      const query = followUp.query?.trim()
      if (!query || seen.has(query)) return null

      seen.add(query)
      return {
        id: followUp.id || `stream-follow-up-${index + 1}`,
        label: followUp.label?.trim() || query,
        query
      }
    })
    .filter(
      (
        followUp
      ): followUp is {
        id: string
        label: string
        query: string
      } => followUp !== null
    )
}

function parseJsonPayload<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function metadataFromStreamPayloads({
  completionPayload,
  eventSources,
  eventFollowUps
}: {
  completionPayload: SearchCompletion | null
  eventSources: SearchResultItem[]
  eventFollowUps: SearchCompletionFollowUp[]
}): UIMessageMetadata | undefined {
  const completionSources = (completionPayload?.citations ?? [])
    .map(sourceFromCitation)
    .filter((source): source is SearchResultItem => source !== null)
  const sources = dedupeSources(
    completionSources.length > 0 ? completionSources : eventSources
  )
  const followUps = normalizeFollowUps(
    completionPayload?.follow_ups?.length
      ? completionPayload.follow_ups
      : eventFollowUps
  )

  if (sources.length === 0 && followUps.length === 0) {
    return undefined
  }

  return {
    answer: {
      sources,
      citationCount: sources.length,
      followUps
    }
  }
}

function readSearchStreamBody(
  response: Response,
  thread: SearchStreamThread
): Response {
  if (!response.body) {
    return response
  }

  const encoder = new TextEncoder()
  const reader = response.body.getReader()
  let completionText: string | null = null
  let completionPayload: SearchCompletion | null = null
  const eventSources: SearchResultItem[] = []
  let eventFollowUps: SearchCompletionFollowUp[] = []

  function captureSearchMetadata(parsed: ParsedSseFrame | null) {
    if (!parsed) return

    if (parsed.event === 'search.completion') {
      completionPayload = tryParseCompletionPayload(parsed.data)
      completionText = parseCompletionText(completionPayload)
      return
    }

    if (parsed.event === 'source') {
      const source = sourceFromEvent(
        parseJsonPayload<SearchSourceEvent>(parsed.data) ?? {}
      )
      if (source) {
        eventSources.push(source)
      }
      return
    }

    if (parsed.event === 'follow_ups') {
      const payload = parseJsonPayload<SearchFollowUpsEvent>(parsed.data)
      eventFollowUps = payload?.items ?? payload?.follow_ups ?? eventFollowUps
    }
  }

  const body = new ReadableStream({
    async start(controller) {
      const decoder = new TextDecoder()
      let buffer = ''

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            break
          }

          buffer += decoder.decode(value, { stream: true })

          let frameEnd = buffer.indexOf('\n\n')
          while (frameEnd !== -1) {
            const frame = buffer.slice(0, frameEnd)
            buffer = buffer.slice(frameEnd + 2)

            if (frame.trim()) {
              const parsed = parseSseFrame(frame)
              captureSearchMetadata(parsed)

              controller.enqueue(encoder.encode(frame + '\n\n'))
            }

            frameEnd = buffer.indexOf('\n\n')
          }
        }

        if (buffer.trim()) {
          const parsed = parseSseFrame(buffer)
          captureSearchMetadata(parsed)

          controller.enqueue(encoder.encode(buffer))
        }
      } finally {
        controller.close()

        if (typeof completionText === 'string' && completionText.trim()) {
          void upsertMessage(
            thread.id,
            {
              id: generateId(),
              role: 'assistant',
              parts: [{ type: 'text', text: completionText }],
              metadata: metadataFromStreamPayloads({
                completionPayload,
                eventSources,
                eventFollowUps
              })
            },
            thread.userId
          ).catch(error => {
            if (process.env.NODE_ENV !== 'test') {
              console.error('Failed to persist search stream response:', error)
            }
          })
        }
      }
    }
  })

  const headers = new Headers(response.headers)
  headers.delete('content-length')

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers
  })
}

function persistSearchStreamResponse(
  response: Response,
  thread: SearchStreamThread
) {
  return readSearchStreamBody(response, thread)
}
