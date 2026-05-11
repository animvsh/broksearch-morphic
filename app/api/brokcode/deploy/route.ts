import { NextRequest, NextResponse } from 'next/server'

import { unauthorizedResponse, verifyRequestAuth } from '@/lib/brok/auth'
import { enforceBrokCodeAccountOwnership } from '@/lib/brokcode/account-guard'

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
        project.name.toLowerCase() === DEFAULT_RAILWAY_PROJECT_NAME.toLowerCase()
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
      environments?: { edges?: Array<{ node?: RailwayNode | null } | null> | null }
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
    (environmentId && environments.find(environment => environment.id === environmentId)) ||
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
        service.name.toLowerCase() === DEFAULT_RAILWAY_SERVICE_NAME.toLowerCase()
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
  const authResult = await verifyRequestAuth(request)
  if (!authResult.success) {
    return unauthorizedResponse(authResult)
  }
  const accountMismatch = await enforceBrokCodeAccountOwnership(authResult)
  if (accountMismatch) return accountMismatch

  const body = await request.json().catch(() => ({}))
  const commitSha =
    typeof body?.commit_sha === 'string' ? body.commit_sha.trim() : null

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
        requestedByWorkspaceId: authResult.workspace.id,
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

    return NextResponse.json({
      status: 'triggered',
      strategy: 'webhook',
      message: 'Deployment triggered via configured webhook.',
      deployment: payload
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

    return NextResponse.json({
      status: 'triggered',
      strategy: deployment.strategy,
      message: deployment.message,
      deploymentId: deployment.deploymentId,
      railway: target
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
