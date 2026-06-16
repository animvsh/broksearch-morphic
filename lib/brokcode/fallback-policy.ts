export function canUseGenericBrokFallback({
  source,
  commandType,
  allowBrokFallback
}: {
  source?: string
  commandType?: string
  allowBrokFallback?: boolean
}) {
  const normalizedSource = source?.toLowerCase()
  const normalizedCommandType = commandType?.toLowerCase()

  if (normalizedSource === 'browser') {
    return (
      normalizedCommandType === 'verify' ||
      normalizedCommandType === 'security_scan'
    )
  }

  if (allowBrokFallback) return true
  return true
}
