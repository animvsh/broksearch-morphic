'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { AlertCircle, ArrowRight, KeyRound, Sparkles } from 'lucide-react'

import { resolveSafeNextPath } from '@/lib/auth/redirect'
import { createClient } from '@/lib/supabase/client'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { PasswordInput } from './ui/password-input'
import { AccessRequestForm } from './access-request-form'

function getLoginErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return 'An error occurred'
  }

  if (error.message.toLowerCase() === 'failed to fetch') {
    return 'Authentication service is unreachable right now. You can request access below while we reconnect it.'
  }

  return error.message
}

export function LoginForm({
  className,
  redirectTo,
  ...props
}: React.ComponentPropsWithoutRef<'div'> & { redirectTo?: string }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const safeRedirectTo = resolveSafeNextPath(redirectTo)
  const signUpHref =
    safeRedirectTo === '/'
      ? '/auth/sign-up'
      : `/auth/sign-up?redirectTo=${encodeURIComponent(safeRedirectTo)}`

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      })
      if (error) throw error
      // Redirect to the requested page and refresh to ensure server components get updated session
      router.replace(safeRedirectTo)
      router.refresh()
    } catch (error: unknown) {
      setError(getLoginErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div
      className={cn('flex flex-col items-center gap-6', className)}
      {...props}
    >
      <Card className="w-full max-w-sm border-border/70 shadow-xl shadow-foreground/5">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border bg-background shadow-sm">
            <IconLogo className="size-9" />
          </div>
          <CardTitle className="flex flex-col items-center justify-center gap-2 text-2xl">
            Welcome back
          </CardTitle>
          <CardDescription>
            Sign in to search, build, and manage your Brok workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  className="min-h-11"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center">
                  <Label htmlFor="password">Password</Label>
                  <Link
                    href="/auth/forgot-password"
                    className="ml-auto inline-flex h-11 min-h-11 min-w-11 items-center rounded-md px-2 text-sm font-medium underline-offset-4 hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <PasswordInput
                  id="password"
                  type="password"
                  placeholder="********"
                  className="min-h-11"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
              </div>
              {error && (
                <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <p>{error}</p>
                </div>
              )}
              <Button
                type="submit"
                className="h-11 w-full gap-2"
                disabled={isLoading}
              >
                <KeyRound className="size-4" />
                {isLoading ? 'Signing in...' : 'Sign in'}
                {!isLoading && <ArrowRight className="size-4" />}
              </Button>
            </form>
          </div>
          <div className="mt-6 rounded-lg border bg-muted/20 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <Sparkles className="size-4" />
              Need access?
            </div>
            <AccessRequestForm defaultEmail={email} compact />
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Prefer the dedicated flow?{' '}
              <Link
                href={signUpHref}
                className="inline-flex h-11 min-h-11 min-w-11 items-center rounded-md px-2.5 underline underline-offset-4"
              >
                Open request form
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
      <div className="text-center text-xs text-muted-foreground">
        <Link
          href="/"
          className="inline-flex h-11 min-h-11 min-w-11 items-center justify-center rounded-md px-2 hover:underline"
        >
          &larr; Back to Home
        </Link>
      </div>
    </div>
  )
}
