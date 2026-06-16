import { redirect } from 'next/navigation'

import { isAnonymousAuthMode } from '@/lib/auth/get-current-user'
import { resolveSafeNextPath } from '@/lib/auth/redirect'

import { SignUpForm } from '@/components/sign-up-form'

export default async function Page({
  searchParams
}: {
  searchParams: Promise<{ redirectTo?: string }>
}) {
  const params = await searchParams
  const safeRedirectTo = resolveSafeNextPath(params.redirectTo, '/search')

  if (isAnonymousAuthMode()) {
    redirect(safeRedirectTo)
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-[radial-gradient(circle_at_top,_hsl(var(--muted))_0,_transparent_32rem)] p-4 md:p-10">
      <div className="w-full max-w-sm">
        <SignUpForm redirectTo={safeRedirectTo} />
      </div>
    </div>
  )
}
