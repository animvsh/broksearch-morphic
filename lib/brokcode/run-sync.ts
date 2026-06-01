export function normalizeBrokCodeGeneratedFilePaths(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  const seen = new Set<string>()
  const paths: string[] = []

  for (const item of value) {
    if (typeof item !== 'string') continue

    const path = item.trim()
    if (!path || seen.has(path)) continue

    seen.add(path)
    paths.push(path)
  }

  return paths
}

export function shouldRefreshBrokCodeProjectAfterServerRun({
  generatedFilesCount,
  serverFileChangesCount,
  serverGeneratedFilePathsCount
}: {
  generatedFilesCount: number
  serverFileChangesCount: number
  serverGeneratedFilePathsCount: number
}) {
  if (generatedFilesCount > 0) return false

  return serverFileChangesCount > 0 || serverGeneratedFilePathsCount > 0
}
