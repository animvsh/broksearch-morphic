const GOOGLE_PROVIDER_NOT_ENABLED_PATTERN =
  /unsupported provider|provider is not enabled/i

export function formatOAuthErrorMessage(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'An OAuth error occurred.'

  if (GOOGLE_PROVIDER_NOT_ENABLED_PATTERN.test(message)) {
    return [
      'Google sign-in is not enabled for this Brok Supabase project yet.',
      'Enable the Google provider in Supabase Auth, add the Google OAuth client ID and secret, and include this site in the allowed redirect URLs.'
    ].join(' ')
  }

  return message
}
