import { redirect } from 'next/navigation'

import { getCurrentUser } from './get-current-user'

export async function requirePageAuth(redirectTo: string) {
  const user = await getCurrentUser()

  if (!user) {
    redirect(`/auth/login?redirectTo=${encodeURIComponent(redirectTo)}`)
  }

  return user
}
