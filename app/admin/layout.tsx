import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'

import { requireAdminAccess } from '@/lib/auth/admin'

export default async function AdminLayout({
  children
}: {
  children: ReactNode
}) {
  const access = await requireAdminAccess()

  if (!access.ok) {
    if (access.status === 401) {
      redirect(`/auth/login?redirectTo=${encodeURIComponent('/admin')}`)
    }

    redirect('/')
  }

  return children
}
