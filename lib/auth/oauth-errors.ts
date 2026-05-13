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
      'Google sign-in is not supported for this Brok deployment.',
      'Use email/password for platform login. Gmail and Calendar integrations are handled through Composio after sign-in.'
    ].join(' ')
  }

  return message
}
