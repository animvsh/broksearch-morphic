import type { SearchMode } from '@/lib/types/search'

import { getCurrentUserId } from './get-current-user'

export function isGuestSearchEnabled() {
  return process.env.ENABLE_GUEST_CHAT === 'true'
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
