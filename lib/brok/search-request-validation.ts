import { NextResponse } from 'next/server'

import { invalidRequestResponse } from '@/lib/brok/http'
import { BROK_MODELS, isValidBrokModel } from '@/lib/brok/models'

export type BrokSearchDepth = 'lite' | 'standard' | 'deep'

type ParsedSearchDepth =
  | { ok: true; depth: BrokSearchDepth }
  | { ok: false; code: string; message: string }

export type ValidatedSearchApiRequest = {
  query: string
  model: string
  stream: boolean
  depth: BrokSearchDepth
  domains?: string[]
  recencyDays?: number
}

export type SearchApiRequestBody = {
  query?: unknown
  model?: unknown
  stream?: unknown
  mode?: unknown
  depth?: unknown
  search_depth?: unknown
  domains?: unknown
  recency_days?: unknown
}

export const INVALID_SEARCH_DEPTH_MESSAGE =
  'search_depth must be one of lite, standard, deep, basic, quick, or advanced.'

export function parseSearchDepth(
  value: unknown,
  defaultDepth: BrokSearchDepth = 'standard'
): ParsedSearchDepth {
  if (value === undefined || value === null) {
    return { ok: true, depth: defaultDepth }
  }

  if (value === 'deep' || value === 'advanced') {
    return { ok: true, depth: 'deep' }
  }

  if (value === 'lite' || value === 'basic' || value === 'quick') {
    return { ok: true, depth: 'lite' }
  }

  if (value === 'standard') {
    return { ok: true, depth: 'standard' }
  }

  return {
    ok: false,
    code: 'invalid_search_depth',
    message: INVALID_SEARCH_DEPTH_MESSAGE
  }
}

export function invalidSearchDepthResponse() {
  return invalidRequestResponse(
    'invalid_search_depth',
    INVALID_SEARCH_DEPTH_MESSAGE
  )
}

export function modeDefaultSearchDepth(mode: unknown): BrokSearchDepth {
  if (mode === 'deep') return 'deep'
  if (mode === 'quick') return 'lite'
  return 'standard'
}

function compatibilityDepthInput(body: SearchApiRequestBody) {
  if (body.mode === 'deep' || body.mode === 'deep_search') return 'deep'
  if (body.mode === 'quick' || body.mode === 'lite') return 'lite'
  return body.depth ?? body.search_depth
}

function invalidSearchModelResponse(
  status: 400 | 403,
  code: string,
  message: string
) {
  return NextResponse.json(
    {
      error: {
        type: 'invalid_request_error',
        code,
        message
      }
    },
    { status }
  )
}

export function validateSearchApiRequest({
  body,
  allowedModels,
  allowModeDepthAliases = false,
  domainMode = 'strict'
}: {
  body: SearchApiRequestBody
  allowedModels?: unknown
  allowModeDepthAliases?: boolean
  domainMode?: 'strict' | 'filter'
}):
  | { ok: true; value: ValidatedSearchApiRequest }
  | { ok: false; response: NextResponse } {
  if (typeof body.query !== 'string' || !body.query.trim()) {
    return {
      ok: false,
      response: invalidRequestResponse(
        'missing_query',
        'query must be a non-empty string.'
      )
    }
  }

  if (body.stream !== undefined && typeof body.stream !== 'boolean') {
    return {
      ok: false,
      response: invalidRequestResponse(
        'invalid_stream',
        'stream must be a boolean.'
      )
    }
  }

  if (body.model !== undefined && typeof body.model !== 'string') {
    return {
      ok: false,
      response: invalidRequestResponse(
        'invalid_model',
        'model must be a string.'
      )
    }
  }

  const model =
    typeof body.model === 'string' && body.model.trim().length > 0
      ? body.model
      : 'brok-search'

  if (!isValidBrokModel(model) || !BROK_MODELS[model].supportsSearch) {
    return {
      ok: false,
      response: invalidSearchModelResponse(
        400,
        'invalid_model',
        'Model does not support search. Use brok-search or brok-search-pro.'
      )
    }
  }

  const normalizedAllowedModels = Array.isArray(allowedModels)
    ? (allowedModels as string[])
    : []
  if (
    normalizedAllowedModels.length > 0 &&
    !normalizedAllowedModels.includes(model)
  ) {
    return {
      ok: false,
      response: invalidSearchModelResponse(
        403,
        'model_not_allowed',
        `This API key does not have access to ${model}.`
      )
    }
  }

  const depthResult = parseSearchDepth(
    allowModeDepthAliases
      ? compatibilityDepthInput(body)
      : (body.depth ?? body.search_depth)
  )
  if (!depthResult.ok) {
    return {
      ok: false,
      response: invalidRequestResponse(depthResult.code, depthResult.message)
    }
  }

  const domains = Array.isArray(body.domains)
    ? domainMode === 'filter'
      ? body.domains.filter(
          (domain): domain is string => typeof domain === 'string'
        )
      : body.domains.every(domain => typeof domain === 'string')
        ? body.domains
        : undefined
    : undefined

  return {
    ok: true,
    value: {
      query: body.query.trim(),
      model,
      stream: body.stream === false ? false : true,
      depth: depthResult.depth,
      domains,
      recencyDays:
        typeof body.recency_days === 'number' ? body.recency_days : undefined
    }
  }
}
