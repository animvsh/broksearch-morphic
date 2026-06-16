import Link from 'next/link'

import { CopyButton } from '@/components/copy-button'

import spec from '@/docs/openapi/brok-v1.openapi.json'

type OpenApiSchema = {
  type?: string | string[]
  format?: string
  description?: string
  enum?: string[]
  items?: OpenApiSchema
  properties?: Record<string, OpenApiSchema>
  required?: string[]
  oneOf?: OpenApiSchema[]
  anyOf?: OpenApiSchema[]
  $ref?: string
}

type OpenApiOperation = {
  summary?: string
  description?: string
  operationId?: string
  tags?: string[]
  requestBody?: {
    content?: Record<string, { schema?: OpenApiSchema }>
  }
  responses?: Record<
    string,
    {
      description?: string
      headers?: Record<string, unknown>
      content?: Record<string, { schema?: OpenApiSchema }>
    }
  >
  'x-brok-sse-events'?: Array<{
    event: string
    description: string
    schema?: OpenApiSchema
  }>
}

type Endpoint = {
  method: string
  path: string
  operation: OpenApiOperation
}

const endpoints = Object.entries(spec.paths).flatMap(([path, methods]) =>
  Object.entries(methods).map(([method, operation]) => ({
    method: method.toUpperCase(),
    path,
    operation: operation as OpenApiOperation
  }))
) satisfies Endpoint[]

const pageContent = `# Brok API Reference

Base URL: https://www.brok.fyi
OpenAPI: https://www.brok.fyi/api/openapi

${endpoints
  .map(endpoint => {
    return `## ${endpoint.method} ${endpoint.path}

${endpoint.operation.summary ?? ''}

Operation ID: \`${endpoint.operation.operationId ?? 'unknown'}\`

Responses: ${Object.keys(endpoint.operation.responses ?? {}).join(', ')}
${
  endpoint.operation['x-brok-sse-events']
    ? `Streaming events: ${endpoint.operation['x-brok-sse-events']
        .map(event => event.event)
        .join(', ')}`
    : ''
}`
  })
  .join('\n\n')}`

export default function ApiReferencePage() {
  return (
    <div className="container max-w-6xl py-8">
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="max-w-3xl">
          <p className="mb-2 text-sm font-medium text-muted-foreground">
            Generated from the Brok v1 OpenAPI contract
          </p>
          <h1 className="mb-4 text-4xl font-bold">API Reference</h1>
          <p className="text-xl text-muted-foreground">
            Every public Brok v1 endpoint in one place, including auth, request
            IDs, request fields, response codes, and streaming event names.
          </p>
        </div>
        <CopyButton content={pageContent} />
      </div>

      <section className="mb-8 grid gap-4 md:grid-cols-3">
        <ReferenceCard
          title="Base URL"
          value="https://www.brok.fyi"
          description="Use the same origin for API calls and the hosted OpenAPI document."
        />
        <ReferenceCard
          title="Auth"
          value="Authorization: Bearer"
          description="Send a Brok secret API key from server-side code only."
        />
        <ReferenceCard
          title="Request ID"
          value="x-request-id"
          description="Every documented response includes a request ID for support and logs."
        />
      </section>

      <section className="mb-8 rounded-lg border p-4">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Contract Artifacts</h2>
            <p className="text-sm text-muted-foreground">
              The JSON contract is the source for this reference and for local
              launch checks.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/api/openapi"
              className="rounded-md border px-3 py-2 text-sm transition-colors hover:border-primary hover:bg-muted/50"
            >
              OpenAPI JSON
            </Link>
            <Link
              href="/docs/errors"
              className="rounded-md border px-3 py-2 text-sm transition-colors hover:border-primary hover:bg-muted/50"
            >
              Error Guide
            </Link>
          </div>
        </div>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
          <code>{`bun run check:openapi
curl https://www.brok.fyi/api/openapi`}</code>
        </pre>
      </section>

      <div className="grid gap-6">
        {endpoints.map(endpoint => (
          <EndpointSection
            key={`${endpoint.method} ${endpoint.path}`}
            endpoint={endpoint}
          />
        ))}
      </div>
    </div>
  )
}

function EndpointSection({ endpoint }: { endpoint: Endpoint }) {
  const requestSchema = getJsonSchema(endpoint.operation.requestBody?.content)
  const responseEntries = Object.entries(endpoint.operation.responses ?? {})
  const requestProperties = getSchemaProperties(requestSchema)
  const sseEvents = endpoint.operation['x-brok-sse-events'] ?? []

  return (
    <section className="rounded-lg border p-5">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-primary px-2 py-1 font-mono text-xs font-semibold text-primary-foreground">
              {endpoint.method}
            </span>
            <code className="break-all rounded-md bg-muted px-2 py-1 text-sm">
              {endpoint.path}
            </code>
          </div>
          <h2 className="text-xl font-semibold">
            {endpoint.operation.summary}
          </h2>
          {endpoint.operation.description ? (
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              {endpoint.operation.description}
            </p>
          ) : null}
        </div>
        <code className="rounded-md border px-2 py-1 text-xs text-muted-foreground">
          {endpoint.operation.operationId}
        </code>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
        <div className="space-y-5">
          {requestProperties.length > 0 ? (
            <ReferenceTable
              title="Request Fields"
              columns={['Name', 'Type', 'Required', 'Description']}
              rows={requestProperties.map(property => [
                property.name,
                formatSchemaType(property.schema),
                property.required ? 'Yes' : 'No',
                property.schema.description ?? ''
              ])}
            />
          ) : (
            <div>
              <h3 className="mb-2 text-base font-semibold">Request Fields</h3>
              <p className="text-sm text-muted-foreground">
                This endpoint does not require a JSON request body.
              </p>
            </div>
          )}

          <ReferenceTable
            title="Responses"
            columns={['Status', 'Description', 'Media Types']}
            rows={responseEntries.map(([status, response]) => [
              status,
              response.description ?? '',
              Object.keys(response.content ?? {}).join(', ') || 'none'
            ])}
          />

          {sseEvents.length > 0 ? (
            <ReferenceTable
              title="Streaming Events"
              columns={['Event', 'Description']}
              rows={sseEvents.map(event => [event.event, event.description])}
            />
          ) : null}
        </div>

        <div className="space-y-4">
          <div>
            <h3 className="mb-2 text-base font-semibold">Curl</h3>
            <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
              <code>{buildCurlExample(endpoint)}</code>
            </pre>
          </div>
          <div>
            <h3 className="mb-2 text-base font-semibold">Headers</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <code>Authorization</code> with a server-side Brok API key
              </li>
              <li>
                <code>Content-Type: application/json</code> for POST routes
              </li>
              <li>
                Read <code>x-request-id</code> from responses for debugging
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}

function ReferenceCard({
  title,
  value,
  description
}: {
  title: string
  value: string
  description: string
}) {
  return (
    <div className="rounded-lg border p-4">
      <h2 className="mb-2 text-base font-semibold">{title}</h2>
      <code className="mb-2 block break-all rounded-md bg-muted px-2 py-1 text-sm">
        {value}
      </code>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  )
}

function ReferenceTable({
  title,
  columns,
  rows
}: {
  title: string
  columns: string[]
  rows: string[][]
}) {
  return (
    <div>
      <h3 className="mb-2 text-base font-semibold">{title}</h3>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              {columns.map(column => (
                <th key={column} className="px-3 py-2 text-left font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${title}-${index}`} className="border-b last:border-0">
                {row.map((cell, cellIndex) => (
                  <td
                    key={`${title}-${index}-${cellIndex}`}
                    className="px-3 py-2 align-top"
                  >
                    {cellIndex === 0 ? (
                      <code className="break-all">{cell}</code>
                    ) : (
                      cell
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function getJsonSchema(
  content: Record<string, { schema?: OpenApiSchema }> | undefined
) {
  return content?.['application/json']?.schema
}

function getSchemaProperties(schema: OpenApiSchema | undefined) {
  const resolved = resolveSchema(schema)
  return Object.entries(resolved?.properties ?? {}).map(([name, property]) => ({
    name,
    schema: property,
    required: Boolean(resolved?.required?.includes(name))
  }))
}

function resolveSchema(schema: OpenApiSchema | undefined): OpenApiSchema {
  if (!schema?.$ref) return schema ?? {}

  const schemaName = schema.$ref.replace('#/components/schemas/', '')
  return (
    (spec.components.schemas as Record<string, OpenApiSchema>)[schemaName] ?? {}
  )
}

function formatSchemaType(schema: OpenApiSchema): string {
  if (schema.$ref) return schema.$ref.replace('#/components/schemas/', '')
  if (schema.enum) return schema.enum.map(value => `"${value}"`).join(' | ')
  if (schema.oneOf) return schema.oneOf.map(formatSchemaType).join(' | ')
  if (schema.anyOf) return schema.anyOf.map(formatSchemaType).join(' | ')
  if (schema.type === 'array')
    return `${formatSchemaType(schema.items ?? {})}[]`
  if (Array.isArray(schema.type)) return schema.type.join(' | ')
  return schema.format
    ? `${schema.type ?? 'value'}:${schema.format}`
    : (schema.type ?? 'value')
}

function buildCurlExample(endpoint: Endpoint) {
  const requestSchema = resolveSchema(
    getJsonSchema(endpoint.operation.requestBody?.content)
  )
  const body = sampleForSchema(requestSchema)
  const headers = [
    '-H "Authorization: Bearer $BROK_API_KEY"',
    endpoint.method === 'POST' ? '-H "Content-Type: application/json"' : null
  ].filter(Boolean)

  const lines = [
    `curl https://www.brok.fyi${endpoint.path} \\`,
    `  ${headers.join(' \\\n  ')}`
  ]

  if (endpoint.method === 'POST') {
    lines.push(`  -d '${JSON.stringify(body, null, 2)}'`)
  }

  return lines.join('\n')
}

function sampleForSchema(schema: OpenApiSchema): unknown {
  const resolved = resolveSchema(schema)
  if (resolved.properties) {
    return Object.fromEntries(
      Object.entries(resolved.properties)
        .filter(([name]) => resolved.required?.includes(name))
        .map(([name, property]) => [name, sampleForSchema(property)])
    )
  }
  if (resolved.enum) return resolved.enum[0]
  if (resolved.type === 'array') return [sampleForSchema(resolved.items ?? {})]
  if (resolved.type === 'boolean') return true
  if (resolved.type === 'number' || resolved.type === 'integer') return 1
  if (resolved.type === 'object') return {}
  return 'string'
}
