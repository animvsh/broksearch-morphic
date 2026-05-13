import { describe, expect, it } from 'vitest'

import { formatOAuthErrorMessage } from '@/lib/auth/oauth-errors'

describe('formatOAuthErrorMessage', () => {
  it('turns disabled Google provider errors into actionable setup guidance', () => {
    expect(
      formatOAuthErrorMessage(
        new Error('Unsupported provider: provider is not enabled')
      )
    ).toBe(
      'Google sign-in is not enabled for this Brok Supabase project yet. Enable the Google provider in Supabase Auth, add the Google OAuth client ID and secret, and include this site in the allowed redirect URLs.'
    )
  })

  it('keeps unrelated OAuth errors intact', () => {
    expect(formatOAuthErrorMessage(new Error('Popup was closed.'))).toBe(
      'Popup was closed.'
    )
  })
})
