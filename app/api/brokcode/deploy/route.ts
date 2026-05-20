import { NextRequest, NextResponse } from 'next/server'

import { requireAdminAccess } from '@/lib/auth/admin'
import {
  apiKeyHasScope,
  forbiddenScopeResponse,
  unauthorizedResponse
} from '@/lib/brok/auth'
import {
  BrokCodeAuthResult,
  enforceBrokCodeAccountOwnership,
  getBrokCodeBrowserSessionAuth,
  verifyBrokCodeRequestAuth
} from '@/lib/brokcode/account-guard'
import { inspectGeneratedBrokCodeAppQuality } from '@/lib/brokcode/generated-files'
import {
  hasRenderableManagedPreview,
  makeManagedDeploymentUrl,
  makeManagedPreviewUrl,
  resolvePublicPreviewOrigin
} from '@/lib/brokcode/preview'
import {
  getBrokCodeProject,
  listBrokCodeProjectFiles,
  recordBrokCodeProjectDeployment,
  updateBrokCodeProjectPreview
} from '@/lib/brokcode/project-store'

export const runtime = 'nodejs'

const RAILWAY_GRAPHQL_ENDPOINT =
  process.env.RAILWAY_GRAPHQL_URL ?? 'https://backboard.railway.app/graphql/v2'
const DEFAULT_RAILWAY_PROJECT_NAME =
  process.env.RAILWAY_PROJECT_NAME?.trim() || 'brok'
const DEFAULT_RAILWAY_ENVIRONMENT_NAME =
  process.env.RAILWAY_ENVIRONMENT_NAME?.trim() || 'production'
const DEFAULT_RAILWAY_SERVICE_NAME =
  process.env.RAILWAY_SERVICE_NAME?.trim() || 'brok'

type GraphqlError = {
  message?: string
}

type GraphqlResponse<TData> = {
  data?: TData
  errors?: GraphqlError[]
}

type RailwayNode = {
  id: string
  name: string
}

class ManagedDeployValidationError extends Error {
  status = 422
}

function normalizeDeployPreviewUrl(value: unknown) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null

  try {
    const withProtocol = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`
    const url = new URL(withProtocol)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    return url.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

function findPreviewUrlFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  const direct =
    normalizeDeployPreviewUrl(record.previewUrl) ??
    normalizeDeployPreviewUrl(record.deploymentPreviewUrl) ??
    normalizeDeployPreviewUrl(record.preview_url) ??
    normalizeDeployPreviewUrl(record.deploymentUrl) ??
    normalizeDeployPreviewUrl(record.deployment_url) ??
    normalizeDeployPreviewUrl(record.url) ??
    normalizeDeployPreviewUrl(record.domain)
  if (direct) return direct

  for (const value of Object.values(record)) {
    if (value && typeof value === 'object') {
      const nested = findPreviewUrlFromPayload(value)
      if (nested) return nested
    }
  }

  return null
}

function resolveDeployPreviewUrl(payload?: unknown) {
  return (
    findPreviewUrlFromPayload(payload) ??
    normalizeDeployPreviewUrl(process.env.BROKCODE_PREVIEW_URL) ??
    normalizeDeployPreviewUrl(process.env.BROKCODE_DEPLOY_PREVIEW_URL) ??
    normalizeDeployPreviewUrl(process.env.NEXT_PUBLIC_BROKCODE_PREVIEW_URL)
  )
}

function getProjectIdFromBody(body: Record<string, unknown>) {
  return typeof body.project_id === 'string' && body.project_id.trim()
    ? body.project_id.trim()
    : typeof body.projectId === 'string' && body.projectId.trim()
      ? body.projectId.trim()
      : null
}

async function persistDeploymentIfProjectSelected({
  projectId,
  auth,
  provider,
  status,
  url,
  metadata
}: {
  projectId: string | null
  auth: BrokCodeAuthResult
  provider: string
  status: string
  url: string | null
  metadata?: Record<string, unknown>
}) {
  if (!projectId) return null

  const project = await getBrokCodeProject({
    id: projectId,
    workspaceId: auth.workspace.id,
    userId: auth.apiKey.userId
  })
  if (!project) {
    throw new Error('Selected BrokCode project was not found.')
  }

  return recordBrokCodeProjectDeployment({
    projectId,
    workspaceId: auth.workspace.id,
    userId: auth.apiKey.userId,
    provider,
    status,
    url,
    metadata
  })
}

async function triggerManagedPreviewDeployment({
  auth,
  projectId,
  request
}: {
  auth: BrokCodeAuthResult
  projectId: string
  request: NextRequest
}) {
  const project = await getBrokCodeProject({
    id: projectId,
    workspaceId: auth.workspace.id,
    userId: auth.apiKey.userId
  })
  if (!project) {
    throw new Error('Selected BrokCode project was not found.')
  }

  const files = await listBrokCodeProjectFiles({
    projectId: project.id,
    workspaceId: auth.workspace.id
  })
  if (!hasRenderableManagedPreview(files)) {
    throw new ManagedDeployValidationError(
      'BrokCode cannot publish this project yet because it does not have a renderable index.html. Ask BrokCode to build a static app first.'
    )
  }

  const quality = inspectGeneratedBrokCodeAppQuality(files)
  if (quality.issues.length > 0) {
    throw new ManagedDeployValidationError(
      `BrokCode cannot publish this project until the generated app quality gate passes: ${quality.issues.join(', ')}.`
    )
  }

  const previewUrl = makeManagedPreviewUrl({
    origin: resolvePublicPreviewOrigin(request),
    projectId: project.id
  })
  const deploymentUrl = makeManagedDeploymentUrl({
    origin: resolvePublicPreviewOrigin(request),
    project
  })
  const generatedAt = new Date().toISOString()
  const updatedProject = await updateBrokCodeProjectPreview({
    projectId: project.id,
    workspaceId: auth.workspace.id,
    userId: auth.apiKey.userId,
    previewUrl,
    deploymentUrl,
    status: 'deployed',
    metadata: {
      mode: 'managed_live_preview',
      fileCount: files.length,
      quality,
      generatedAt,
      hotReload: true
    }
  })
  const persistedDeployment = await recordBrokCodeProjectDeployment({
    projectId: project.id,
    workspaceId: auth.workspace.id,
    userId: auth.apiKey.userId,
    provider: 'managed_preview',
    status: 'deployed',
    url: deploymentUrl,
    subdomain: project.username ?? project.slug,
    metadata: {
      strategy: 'managed_live_preview',
      previewUrl,
      fileCount: files.length,
      quality,
      generatedAt
    }
  })

  return {
    status: 'deployed',
    strategy: 'managed_live_preview',
    message: 'BrokCode app is live on its managed URL.',
    deploymentId: persistedDeployment?.id ?? null,
    persistedDeployment,
    project: updatedProject ?? project,
    previewUrl,
    deploymentPreviewUrl: deploymentUrl,
    deploymentUrl,
    fileCount: files.length
  }
}

function summarizeGraphqlErrors(errors: GraphqlError[] | undefined) {
  if (!errors || errors.length === 0) return null

  return errors
    .map(error => error.message?.trim())
    .filter((message): message is string => Boolean(message))
    .join(' | ')
}

function namesForMessage(nodes: RailwayNode[]) {
  const names = nodes.map(node => node.name).filter(Boolean)
  return names.length > 0 ? names.join(', ') : 'none'
}

async function railwayGraphqlRequest<TData>(
  query: string,
  variables: Record<string, string | null | undefined>,
  token: string
): Promise<GraphqlResponse<TData>> {
  const response = await fetch(RAILWAY_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ query, variables })
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(
      `Railway API request failed (${response.status})${body ? `: ${body}` : '.'}`
    )
  }

  return (await response.json()) as GraphqlResponse<TData>
}

async function resolveRailwayTarget({
  token,
  projectId,
  environmentId,
  serviceId
}: {
  token: string
  projectId?: string | null
  environmentId?: string | null
  serviceId?: string | null
}) {
  if (environmentId && serviceId) {
    return {
      projectId: projectId ?? null,
      projectName: null,
      environmentId,
      environmentName: null,
      serviceId,
      serviceName: null
    }
  }

  let targetProjectId = projectId ?? null
  let targetProjectName: string | null = null

  if (!targetProjectId) {
    const projectsQuery = `
      query BrokcodeProjects {
        projects {
          edges {
            node {
              id
              name
            }
          }
        }
      }
    `
    const projectsResult = await railwayGraphqlRequest<{
      projects?: { edges?: Array<{ node?: RailwayNode | null } | null> | null }
    }>(projectsQuery, {}, token)

    const projectError = summarizeGraphqlErrors(projectsResult.errors)
    if (projectError) {
      throw new Error(projectError)
    }

    const projects =
      projectsResult.data?.projects?.edges
        ?.map(edge => edge?.node)
        .filter((node): node is RailwayNode => Boolean(node?.id)) ?? []

    if (projects.length === 0) {
      throw new Error('No Railway projects are available for this token.')
    }

    const byName = projects.find(
      project =>
        project.name.toLowerCase() ===
        DEFAULT_RAILWAY_PROJECT_NAME.toLowerCase()
    )
    const pickedProject = byName ?? projects[0]
    targetProjectId = pickedProject.id
    targetProjectName = pickedProject.name
  }

  const projectDetailsQuery = `
    query BrokcodeProject($projectId: String!) {
      project(id: $projectId) {
        id
        name
        environments {
          edges {
            node {
              id
              name
            }
          }
        }
        services {
          edges {
            node {
              id
              name
            }
          }
        }
      }
    }
  `

  const projectDetails = await railwayGraphqlRequest<{
    project?: {
      id: string
      name: string
      environments?: {
        edges?: Array<{ node?: RailwayNode | null } | null> | null
      }
      services?: { edges?: Array<{ node?: RailwayNode | null } | null> | null }
    } | null
  }>(projectDetailsQuery, { projectId: targetProjectId }, token)

  const detailsError = summarizeGraphqlErrors(projectDetails.errors)
  if (detailsError) {
    throw new Error(detailsError)
  }

  const project = projectDetails.data?.project
  if (!project) {
    throw new Error('Could not resolve Railway project details.')
  }

  const environments =
    project.environments?.edges
      ?.map(edge => edge?.node)
      .filter((node): node is RailwayNode => Boolean(node?.id)) ?? []
  const services =
    project.services?.edges
      ?.map(edge => edge?.node)
      .filter((node): node is RailwayNode => Boolean(node?.id)) ?? []

  if (environments.length === 0) {
    throw new Error('No Railway environments are available for this project.')
  }
  if (services.length === 0) {
    throw new Error('No Railway services are available for this project.')
  }

  const pickedEnvironment =
    (environmentId &&
      environments.find(environment => environment.id === environmentId)) ||
    environments.find(
      environment =>
        environment.name.toLowerCase() ===
        DEFAULT_RAILWAY_ENVIRONMENT_NAME.toLowerCase()
    ) ||
    environments[0]

  const pickedService =
    (serviceId && services.find(service => service.id === serviceId)) ||
    services.find(
      service =>
        service.name.toLowerCase() ===
        DEFAULT_RAILWAY_SERVICE_NAME.toLowerCase()
    ) ||
    services[0]

  if (!pickedEnvironment) {
    throw new Error(
      `Could not resolve Railway environment. Available: ${namesForMessage(environments)}`
    )
  }
  if (!pickedService) {
    throw new Error(
      `Could not resolve Railway service. Available: ${namesForMessage(services)}`
    )
  }

  return {
    projectId: project.id,
    projectName: project.name,
    environmentId: pickedEnvironment.id,
    environmentName: pickedEnvironment.name,
    serviceId: pickedService.id,
    serviceName: pickedService.name
  }
}

async function triggerRailwayDeployment({
  token,
  environmentId,
  serviceId,
  commitSha
}: {
  token: string
  environmentId: string
  serviceId: string
  commitSha?: string | null
}) {
  const deployV2Query = `
    mutation TriggerDeployV2($environmentId: String!, $serviceId: String!, $commitSha: String) {
      serviceInstanceDeployV2(environmentId: $environmentId, serviceId: $serviceId, commitSha: $commitSha)
    }
  `

  const deployV2 = await railwayGraphqlRequest<{
    serviceInstanceDeployV2?: string | null
  }>(
    deployV2Query,
    {
      environmentId,
      serviceId,
      commitSha: commitSha ?? null
    },
    token
  )

  if (deployV2.data?.serviceInstanceDeployV2) {
    return {
      strategy: 'railway_graphql_v2',
      deploymentId: deployV2.data.serviceInstanceDeployV2,
      message: 'Railway deployment triggered via serviceInstanceDeployV2.'
    }
  }

  const deployV2Error = summarizeGraphqlErrors(deployV2.errors)

  const deployQuery = `
    mutation TriggerDeploy($environmentId: String!, $serviceId: String!) {
      serviceInstanceDeploy(environmentId: $environmentId, serviceId: $serviceId, latestCommit: true)
    }
  `

  const deploy = await railwayGraphqlRequest<{
    serviceInstanceDeploy?: boolean
  }>(
    deployQuery,
    {
      environmentId,
      serviceId
    },
    token
  )

  if (deploy.data?.serviceInstanceDeploy) {
    return {
      strategy: 'railway_graphql',
      deploymentId: null,
      message: 'Railway deployment triggered via serviceInstanceDeploy.'
    }
  }

  const deployError = summarizeGraphqlErrors(deploy.errors)
  const reason =
    deployError ??
    deployV2Error ??
    'Railway did not confirm deployment creation.'
  throw new Error(reason)
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const projectId = getProjectIdFromBody(body as Record<string, unknown>)
  const hasExplicitCredential = Boolean(
    request.headers.get('authorization') || request.headers.get('x-api-key')
  )
  const browserSessionRequested =
    body?.source === 'browser' || body?.browser_session === true
  const authResult =
    !hasExplicitCredential && browserSessionRequested
      ? ((await getBrokCodeBrowserSessionAuth()) ??
        (await verifyBrokCodeRequestAuth(request)).authResult)
      : (await verifyBrokCodeRequestAuth(request)).authResult

  if (!authResult.success) {
    return unauthorizedResponse(authResult)
  }
  const successfulAuth = authResult as BrokCodeAuthResult
  const accountMismatch = await enforceBrokCodeAccountOwnership(successfulAuth)
  if (accountMismatch) return accountMismatch
  if (successfulAuth.isBrowserSession) {
    const admin = projectId ? { ok: true as const } : await requireAdminAccess()
    if (!admin.ok) {
      return NextResponse.json(
        {
          error: {
            type: 'authorization_error',
            code: 'brokcode_deploy_admin_required',
            message:
              'BrokCode browser deploys are admin-only until per-project deploy targets are configured.'
          }
        },
        { status: 403 }
      )
    }
  }
  if (
    !successfulAuth.isBrowserSession &&
    !apiKeyHasScope(successfulAuth.apiKey, 'code:write')
  ) {
    return forbiddenScopeResponse('code:write')
  }

  const commitSha =
    typeof body?.commit_sha === 'string' ? body.commit_sha.trim() : null
  const deployStrategy =
    typeof body?.strategy === 'string' ? body.strategy.trim() : ''

  if (
    projectId &&
    deployStrategy !== 'railway' &&
    deployStrategy !== 'webhook'
  ) {
    try {
      return NextResponse.json(
        await triggerManagedPreviewDeployment({
          auth: successfulAuth,
          projectId,
          request
        })
      )
    } catch (error) {
      return NextResponse.json(
        {
          error: {
            type: 'deploy_error',
            message:
              error instanceof Error
                ? error.message
                : 'Managed preview deployment failed.'
          }
        },
        {
          status:
            error instanceof ManagedDeployValidationError ? error.status : 502
        }
      )
    }
  }

  const webhookUrl = process.env.BROKCODE_DEPLOY_WEBHOOK_URL?.trim()
  const webhookBearer = process.env.BROKCODE_DEPLOY_WEBHOOK_BEARER?.trim()

  if (webhookUrl) {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(webhookBearer ? { Authorization: `Bearer ${webhookBearer}` } : {})
      },
      body: JSON.stringify({
        source: 'brokcode',
        requestedAt: new Date().toISOString(),
        requestedByWorkspaceId: successfulAuth.workspace.id,
        commitSha: commitSha || undefined
      })
    })

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '')
      return NextResponse.json(
        {
          error: {
            type: 'deploy_error',
            message: `Deploy webhook failed (${response.status})${bodyText ? `: ${bodyText}` : '.'}`
          }
        },
        { status: 502 }
      )
    }

    const payload = await response.json().catch(() => null)

    const previewUrl = resolveDeployPreviewUrl(payload)
    const persistedDeployment = await persistDeploymentIfProjectSelected({
      projectId,
      auth: successfulAuth,
      provider: 'webhook',
      status: 'triggered',
      url: previewUrl,
      metadata: {
        strategy: 'webhook',
        commitSha,
        deployment: payload
      }
    })

    return NextResponse.json({
      status: 'triggered',
      strategy: 'webhook',
      message: 'Deployment triggered via configured webhook.',
      deployment: payload,
      persistedDeployment,
      previewUrl,
      deploymentPreviewUrl: previewUrl
    })
  }

  const railwayToken = process.env.RAILWAY_API_TOKEN?.trim()
  const railwayProjectId = process.env.RAILWAY_PROJECT_ID?.trim()
  const railwayEnvironmentId = process.env.RAILWAY_ENVIRONMENT_ID?.trim()
  const railwayServiceId = process.env.RAILWAY_SERVICE_ID?.trim()

  if (!railwayToken) {
    return NextResponse.json(
      {
        error: {
          type: 'configuration_error',
          message:
            'Deployment is not configured. Set BROKCODE_DEPLOY_WEBHOOK_URL or RAILWAY_API_TOKEN.'
        }
      },
      { status: 503 }
    )
  }

  try {
    const target = await resolveRailwayTarget({
      token: railwayToken,
      projectId: railwayProjectId,
      environmentId: railwayEnvironmentId,
      serviceId: railwayServiceId
    })

    const deployment = await triggerRailwayDeployment({
      token: railwayToken,
      environmentId: target.environmentId,
      serviceId: target.serviceId,
      commitSha
    })

    const previewUrl = resolveDeployPreviewUrl()
    const persistedDeployment = await persistDeploymentIfProjectSelected({
      projectId,
      auth: successfulAuth,
      provider: 'railway',
      status: 'triggered',
      url: previewUrl,
      metadata: {
        strategy: deployment.strategy,
        deploymentId: deployment.deploymentId,
        railway: target,
        commitSha
      }
    })

    return NextResponse.json({
      status: 'triggered',
      strategy: deployment.strategy,
      message: deployment.message,
      deploymentId: deployment.deploymentId,
      railway: target,
      persistedDeployment,
      previewUrl,
      deploymentPreviewUrl: previewUrl
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          type: 'deploy_error',
          message:
            error instanceof Error
              ? error.message
              : 'Railway deployment trigger failed.'
        }
      },
      { status: 502 }
    )
  }
}
