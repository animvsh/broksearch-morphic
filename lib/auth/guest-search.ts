import type { SearchMode } from '@/lib/types/search'

import { getCurrentUserId } from './get-current-user'

export function isGuestSearchEnabled() {
  if (process.env.BROK_CLOUD_DEPLOYMENT === 'true') return false
  if (process.env.ENABLE_GUEST_CHAT === 'true') return true
  if (process.env.ENABLE_GUEST_CHAT === 'false') return false

  return process.env.NODE_ENV !== 'production'
}

export function isGuestSearchMode(mode: SearchMode) {
  return mode === 'quick' || mode === 'search'
}

export async function getCurrentUserIdForOptionalGuestSearch(mode: SearchMode) {
  try {
    return await getCurrentUserId()
  } catch (error) {
    if (!isGuestSearchEnabled() || !isGuestSearchMode(mode)) {
      throw error
    }

    console.warn(
      'Auth lookup failed for guest-enabled search; continuing as guest.',
      error
    )
    return undefined
  }
}
