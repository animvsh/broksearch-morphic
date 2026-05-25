export type BrokCodeGithubRepository = {
  fullName: string
  defaultBranch: string
  private: boolean
  htmlUrl: string | null
  pushedAt: string | null
}

function asRecord(value: unknown) {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null
}

function sanitizeRepositoryFullName(value: unknown) {
  if (typeof value !== 'string') return null

  const cleaned = value
    .trim()
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/^\/+/, '')

  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(cleaned)) return null

  const [owner, repo] = cleaned.split('/')
  if (!owner || !repo) return null
  if ([owner, repo].some(part => part === '.' || part === '..')) return null

  return cleaned
}

export function normalizeGithubRepository(
  value: unknown
): BrokCodeGithubRepository | null {
  const item = asRecord(value)
  if (!item) return null

  const owner = asRecord(item.owner)
  const fullName =
    sanitizeRepositoryFullName(item.full_name) ??
    sanitizeRepositoryFullName(item.fullName) ??
    (typeof item.name === 'string' &&
    (typeof owner?.login === 'string' || typeof owner?.name === 'string')
      ? sanitizeRepositoryFullName(`${owner.login ?? owner.name}/${item.name}`)
      : null)

  if (!fullName) return null

  const defaultBranch =
    typeof item.default_branch === 'string'
      ? item.default_branch
      : typeof item.defaultBranch === 'string'
        ? item.defaultBranch
        : 'main'

  return {
    fullName,
    defaultBranch: defaultBranch.trim() || 'main',
    private: item.private === true,
    htmlUrl:
      typeof item.html_url === 'string'
        ? item.html_url
        : typeof item.htmlUrl === 'string'
          ? item.htmlUrl
          : `https://github.com/${fullName}`,
    pushedAt:
      typeof item.pushed_at === 'string'
        ? item.pushed_at
        : typeof item.pushedAt === 'string'
          ? item.pushedAt
          : typeof item.updated_at === 'string'
            ? item.updated_at
            : null
  }
}

function candidateRepositoryArrays(payload: unknown): unknown[][] {
  if (Array.isArray(payload)) return [payload]

  const root = asRecord(payload)
  if (!root) return []

  const data = asRecord(root.data)
  const nestedData = asRecord(data?.data)
  const output = asRecord(root.output)
  const result = asRecord(root.result)
  const candidates = [
    root.repositories,
    root.repos,
    root.items,
    root.results,
    root.data,
    data?.repositories,
    data?.repos,
    data?.items,
    data?.results,
    data?.data,
    nestedData?.repositories,
    nestedData?.repos,
    nestedData?.items,
    output?.repositories,
    output?.repos,
    output?.items,
    result?.repositories,
    result?.repos,
    result?.items
  ]

  return candidates.filter(Array.isArray) as unknown[][]
}

export function normalizeGithubRepositoryList(payload: unknown) {
  const byFullName = new Map<string, BrokCodeGithubRepository>()

  for (const candidate of candidateRepositoryArrays(payload)) {
    for (const item of candidate) {
      const repository = normalizeGithubRepository(item)
      if (repository && !byFullName.has(repository.fullName)) {
        byFullName.set(repository.fullName, repository)
      }
    }
  }

  return [...byFullName.values()].sort((a, b) => {
    const aTime = a.pushedAt ? Date.parse(a.pushedAt) : 0
    const bTime = b.pushedAt ? Date.parse(b.pushedAt) : 0
    if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) {
      return bTime - aTime
    }
    return a.fullName.localeCompare(b.fullName)
  })
}

export function parseGithubNextLink(linkHeader: string | null) {
  if (!linkHeader) return null

  for (const part of linkHeader.split(',')) {
    const [urlPart, ...params] = part.trim().split(';')
    const rel = params.find(param => param.trim() === 'rel="next"')
    const match = urlPart?.trim().match(/^<(.+)>$/)
    if (rel && match?.[1]) return match[1]
  }

  return null
}
