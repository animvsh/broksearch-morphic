import { createBrowserClient } from '@supabase/ssr'

type BrokPublicEnv = {
  NEXT_PUBLIC_SUPABASE_URL?: string
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string
  NEXT_PUBLIC_GOOGLE_AUTH_ENABLED?: string
}

declare global {
  interface Window {
    __BROK_PUBLIC_ENV__?: BrokPublicEnv
  }
}

export function isGoogleAuthEnabled() {
  const runtimeEnv =
    typeof window !== 'undefined' ? window.__BROK_PUBLIC_ENV__ : undefined

  return (
    process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === 'true' ||
    runtimeEnv?.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === 'true'
  )
}

function getPublicSupabaseConfig() {
  const runtimeEnv =
    typeof window !== 'undefined' ? window.__BROK_PUBLIC_ENV__ : undefined

  return {
    url:
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      runtimeEnv?.NEXT_PUBLIC_SUPABASE_URL,
    key:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      runtimeEnv?.NEXT_PUBLIC_SUPABASE_ANON_KEY
  }
}

export function createClient() {
  const { url, key } = getPublicSupabaseConfig()

  if (!url || !key) {
    console.warn(
      'Supabase client configuration missing. Authentication features will be unavailable. ' +
        'To enable authentication, set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY at build time.'
    )
    throw new Error(
      'Authentication is not configured yet. Please set the Supabase public URL and anon key for this deployment.'
    )
  }

  return createBrowserClient(url, key)
}
