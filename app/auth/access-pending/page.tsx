import Link from 'next/link'

import { MailCheck } from 'lucide-react'

import { getCurrentAppAccess } from '@/lib/auth/app-access'

import { Button } from '@/components/ui/button'

export default async function AccessPendingPage() {
  const access = await getCurrentAppAccess()
  const email = access.user?.email

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4 py-12">
      <section className="w-full max-w-lg rounded-lg border bg-card p-6 shadow-sm">
        <div className="mb-5 flex size-11 items-center justify-center rounded-lg border bg-muted/40">
          <MailCheck className="size-5" />
        </div>
        <h1 className="text-2xl font-semibold">Access pending</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {email
            ? `${email} is signed in, but this account is not on the Brok allowlist yet.`
            : 'Sign in with an approved account to use the private Brok workspace.'}
        </p>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Ask an admin to add your email from the Brok admin panel.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/auth/login">Sign in again</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">Back to landing</Link>
          </Button>
        </div>
      </section>
    </main>
  )
}
