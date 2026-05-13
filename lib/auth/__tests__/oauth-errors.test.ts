import { describe, expect, it } from 'vitest'

import { formatOAuthErrorMessage } from '@/lib/auth/oauth-errors'

describe('formatOAuthErrorMessage', () => {
  it('turns disabled Google provider errors into platform-login guidance', () => {
    expect(
      formatOAuthErrorMessage(
        new Error('Unsupported provider: provider is not enabled')
      )
    ).toBe(
      'Google sign-in is not supported for this Brok deployment. Use email/password for platform login. Gmail and Calendar integrations are handled through Composio after sign-in.'
    )
  })

  it('keeps unrelated OAuth errors intact', () => {
    expect(formatOAuthErrorMessage(new Error('Popup was closed.'))).toBe(
      'Popup was closed.'
    )
  })
})
