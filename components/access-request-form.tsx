'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import type { AccessRequestActionState } from '@/lib/actions/access-requests'
import { submitAccessRequest } from '@/lib/actions/access-requests'
import { cn } from '@/lib/utils/index'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const initialState: AccessRequestActionState = { status: 'idle' }

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? 'Submitting...' : 'Request access'}
    </Button>
  )
}

export function AccessRequestForm({
  className,
  defaultEmail,
  compact = false
}: {
  className?: string
  defaultEmail?: string | null
  compact?: boolean
}) {
  const [state, formAction] = useActionState(submitAccessRequest, initialState)

  return (
    <form action={formAction} className={cn('space-y-4', className)}>
      {!compact ? (
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Request access</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Share the email you want approved and a phone number an admin can
            use for review.
          </p>
        </div>
      ) : null}
      <div className="grid gap-2">
        <Label htmlFor="access-request-email">Email</Label>
        <Input
          id="access-request-email"
          name="email"
          type="email"
          placeholder="you@example.com"
          defaultValue={defaultEmail ?? state.email ?? ''}
          autoComplete="email"
          required
          className="min-h-11"
          aria-invalid={Boolean(state.fieldErrors?.email)}
          aria-describedby={
            state.fieldErrors?.email ? 'access-request-email-error' : undefined
          }
        />
        {state.fieldErrors?.email ? (
          <p id="access-request-email-error" className="text-sm text-red-500">
            {state.fieldErrors.email}
          </p>
        ) : null}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="access-request-phone">Phone number</Label>
        <Input
          id="access-request-phone"
          name="phoneNumber"
          type="tel"
          placeholder="+1 555 123 4567"
          autoComplete="tel"
          required
          className="min-h-11"
          aria-invalid={Boolean(state.fieldErrors?.phoneNumber)}
          aria-describedby={
            state.fieldErrors?.phoneNumber
              ? 'access-request-phone-error'
              : undefined
          }
        />
        {state.fieldErrors?.phoneNumber ? (
          <p id="access-request-phone-error" className="text-sm text-red-500">
            {state.fieldErrors.phoneNumber}
          </p>
        ) : null}
      </div>
      {state.message ? (
        <p
          className={cn(
            'rounded-md border px-3 py-2 text-sm',
            state.status === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-700'
          )}
          role={state.status === 'error' ? 'alert' : 'status'}
        >
          {state.message}
        </p>
      ) : null}
      <SubmitButton />
    </form>
  )
}
