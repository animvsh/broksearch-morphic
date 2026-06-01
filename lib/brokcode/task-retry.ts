export type BrokCodeTaskRetryRequest = {
  command: string
  model?: string
  source?: string
  session_id?: string
  project_id?: string
  backend_provider?: string
  backend_status?: string
  backend_project_url?: string | null
  prefer_pi?: boolean
  require_pi?: boolean
  require_opencode?: boolean
  allow_brok_fallback?: boolean
  retry_of_task_id: string
}

type RetryableBrokCodeTask = {
  id: string
  kind: string
  status?: string | null
  metadata?: Record<string, any> | null
}

type RetryBuildResult =
  | {
      ok: true
      retry: BrokCodeTaskRetryRequest
    }
  | {
      ok: false
      status: 400 | 409
      error: string
    }

function nonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function optionalBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : undefined
}

function assignString(
  target: BrokCodeTaskRetryRequest,
  key: keyof BrokCodeTaskRetryRequest,
  value: unknown
) {
  const text = nonEmptyString(value)
  if (text) {
    Object.assign(target, { [key]: text })
  }
}

function assignBoolean(
  target: BrokCodeTaskRetryRequest,
  key: keyof BrokCodeTaskRetryRequest,
  value: unknown
) {
  const bool = optionalBoolean(value)
  if (typeof bool === 'boolean') {
    Object.assign(target, { [key]: bool })
  }
}

function validateRetryableStatus(status: string | null | undefined) {
  if (!status) return null

  if (status === 'queued' || status === 'running') {
    return {
      status: 409 as const,
      error:
        'This BrokCode task is still running. Wait for it to finish or cancel it before retrying.'
    }
  }

  if (status === 'succeeded') {
    return {
      status: 409 as const,
      error:
        'This BrokCode task already succeeded. Start a new edit instead of retrying it.'
    }
  }

  return null
}

export function buildBrokCodeTaskRetryRequest(
  task: RetryableBrokCodeTask
): RetryBuildResult {
  if (task.kind !== 'brokcode') {
    return {
      ok: false,
      status: 400,
      error: 'Only BrokCode tasks can be retried from this endpoint.'
    }
  }

  const statusError = validateRetryableStatus(task.status)
  if (statusError) {
    return {
      ok: false,
      ...statusError
    }
  }

  const originalRequest = task.metadata?.originalRequest
  if (!originalRequest || typeof originalRequest !== 'object') {
    return {
      ok: false,
      status: 409,
      error: 'Task is missing the original BrokCode request payload.'
    }
  }

  const record = originalRequest as Record<string, unknown>
  const command = nonEmptyString(record.command)
  if (!command) {
    return {
      ok: false,
      status: 409,
      error: 'Task original request is missing a command.'
    }
  }

  const retry: BrokCodeTaskRetryRequest = {
    command,
    retry_of_task_id: task.id
  }

  assignString(retry, 'model', record.model)
  assignString(retry, 'source', record.source)
  assignString(retry, 'session_id', record.sessionId)
  assignString(retry, 'project_id', record.projectId)
  assignString(retry, 'backend_provider', record.backendProvider)
  assignString(retry, 'backend_status', record.backendStatus)

  const backendProjectUrl = nonEmptyString(record.backendProjectUrl)
  if (backendProjectUrl) {
    retry.backend_project_url = backendProjectUrl
  } else if (record.backendProjectUrl === null) {
    retry.backend_project_url = null
  }

  assignBoolean(retry, 'prefer_pi', record.preferPi)
  assignBoolean(retry, 'require_pi', record.requirePi)
  assignBoolean(retry, 'require_opencode', record.requireOpenCode)
  assignBoolean(retry, 'allow_brok_fallback', record.allowBrokFallback)

  return { ok: true, retry }
}
