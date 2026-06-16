#!/usr/bin/env node

import { readFileSync } from 'node:fs'

const SPEC_PATH = 'docs/openapi/brok-v1.openapi.json'

const requiredPaths = {
  '/api/v1/chat/completions': ['post'],
  '/api/v1/messages': ['post'],
  '/api/v1/search/completions': ['post'],
  '/api/v1/models': ['get'],
  '/api/v1/usage': ['get']
}

const streamingOperations = [
  ['/api/v1/chat/completions', 'post'],
  ['/api/v1/messages', 'post'],
  ['/api/v1/search/completions', 'post']
]

const checks = []
let spec

try {
  spec = JSON.parse(readFileSync(SPEC_PATH, 'utf8'))
  pass(`valid JSON: ${SPEC_PATH}`)
} catch (error) {
  fail(`valid JSON: ${SPEC_PATH}`, error)
  finish()
}

check(Boolean(spec.openapi), 'openapi version is declared')
check(spec.openapi === '3.1.0', 'OpenAPI version is 3.1.0')
check(Boolean(spec.info?.title), 'info.title is declared')
check(Boolean(spec.info?.version), 'info.version is declared')
check(
  Boolean(spec.components?.securitySchemes?.BrokApiKey),
  'BrokApiKey security scheme exists'
)
check(
  Boolean(spec.components?.schemas?.ErrorEnvelope),
  'shared ErrorEnvelope schema exists'
)
check(
  Boolean(spec.components?.headers?.RequestId),
  'shared x-request-id header exists'
)

for (const [path, methods] of Object.entries(requiredPaths)) {
  check(Boolean(spec.paths?.[path]), `path exists: ${path}`)
  for (const method of methods) {
    const operation = spec.paths?.[path]?.[method]
    check(
      Boolean(operation),
      `operation exists: ${method.toUpperCase()} ${path}`
    )
    check(
      Boolean(operation?.operationId),
      `operationId exists: ${method.toUpperCase()} ${path}`
    )
    check(
      operation?.security !== undefined || spec.security !== undefined,
      `auth applies: ${method.toUpperCase()} ${path}`
    )
    check(
      Boolean(operation?.responses?.['200']),
      `200 response exists: ${method.toUpperCase()} ${path}`
    )
    check(
      Boolean(operation?.responses?.['401']),
      `401 response exists: ${method.toUpperCase()} ${path}`
    )
    check(
      hasRequestIdHeader(operation),
      `x-request-id documented: ${method.toUpperCase()} ${path}`
    )
    if (method === 'post') {
      check(
        hasIdempotencyParameter(operation),
        `idempotency key documented: ${method.toUpperCase()} ${path}`
      )
      check(
        Boolean(operation?.responses?.['409']),
        `409 response exists: ${method.toUpperCase()} ${path}`
      )
    }
  }
}

for (const [path, method] of streamingOperations) {
  const operation = spec.paths?.[path]?.[method]
  check(
    Array.isArray(operation?.['x-brok-sse-events']) &&
      operation['x-brok-sse-events'].length > 0,
    `SSE events documented: ${method.toUpperCase()} ${path}`
  )
  check(
    Boolean(operation?.responses?.['200']?.content?.['text/event-stream']),
    `text/event-stream response documented: ${method.toUpperCase()} ${path}`
  )
}

for (const schemaName of [
  'ChatCompletionRequest',
  'ChatCompletionResponse',
  'MessagesRequest',
  'MessagesResponse',
  'SearchCompletionRequest',
  'SearchCompletionResponse',
  'ModelList',
  'UsageResponse'
]) {
  check(
    Boolean(spec.components?.schemas?.[schemaName]),
    `schema exists: ${schemaName}`
  )
}

finish()

function hasRequestIdHeader(operation) {
  const headers = operation?.responses?.['200']?.headers ?? {}
  return Boolean(headers['x-request-id'] ?? headers['X-Request-Id'])
}

function hasIdempotencyParameter(operation) {
  const parameters = operation?.parameters ?? []
  return parameters.some(parameter => {
    if (parameter?.$ref === '#/components/parameters/IdempotencyKey') {
      return true
    }
    return parameter?.name?.toLowerCase() === 'idempotency-key'
  })
}

function check(ok, name) {
  if (ok) pass(name)
  else fail(name)
}

function pass(name) {
  checks.push({ ok: true, name })
}

function fail(name, error) {
  checks.push({
    ok: false,
    name,
    error: error instanceof Error ? error.message : undefined
  })
}

function finish() {
  for (const item of checks) {
    console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.name}`)
    if (item.error) console.log(`  ${item.error}`)
  }

  const failed = checks.filter(item => !item.ok)
  if (failed.length > 0) {
    console.log(`\nOpenAPI spec check failed: ${failed.length} issue(s).`)
    process.exit(1)
  }

  console.log(`\nOpenAPI spec check passed: ${checks.length} checks.`)
}
