import { canUseDevDbFallback } from '@/lib/db/dev-db-fallback'

export function canUseUsageDashboardFallback(error: unknown) {
  return canUseDevDbFallback(error)
}
