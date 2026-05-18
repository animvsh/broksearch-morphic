import Link from 'next/link'

import { ShieldCheck } from 'lucide-react'

import { resolveSafeNextPath } from '@/lib/auth/redirect'
import { cn } from '@/lib/utils/index'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { IconLogo } from '@/components/ui/icons'

export function SignUpForm({
  className,
  redirectTo,
  ...props
}: React.ComponentPropsWithoutRef<'div'> & { redirectTo?: string }) {
  const safeRedirectTo = resolveSafeNextPath(redirectTo)
  const signInHref =
    safeRedirectTo === '/'
      ? '/auth/login'
      : `/auth/login?redirectTo=${encodeURIComponent(safeRedirectTo)}`

  return (
    <div
      className={cn('flex flex-col items-center gap-6', className)}
      {...props}
    >
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="flex flex-col items-center justify-center gap-4 text-2xl">
            <IconLogo className="size-12" />
            Brok is private
          </CardTitle>
          <CardDescription>
            New accounts are invite-only while Brok is gated.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-4 text-sm leading-6 text-muted-foreground">
            <ShieldCheck className="mb-3 size-5 text-foreground" />
            Ask an admin to add your email to the private app allowlist. If your
            email is already approved, sign in with that account.
          </div>
          <Button asChild className="w-full">
            <Link href={signInHref}>Sign in</Link>
          </Button>
        </CardContent>
      </Card>
      <div className="text-center text-xs text-muted-foreground">
        <Link href="/" className="hover:underline">
          &larr; Back to Home
        </Link>
      </div>
    </div>
  )
}
