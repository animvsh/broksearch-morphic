'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'

import { getCurrentUser } from '@/lib/auth/get-current-user'
import { db } from '@/lib/db'
import { appAccessRequests } from '@/lib/db/schema'
import {
  accessRequestSchema,
  normalizeAccessRequestPhone
} from '@/lib/schema/access-request'

export type AccessRequestActionState = {
  status: 'idle' | 'success' | 'error'
  message?: string
  email?: string
  fieldErrors?: {
    email?: string
    phoneNumber?: string
  }
}

const defaultError =
  'We could not submit your access request. Please try again in a moment.'

export async function submitAccessRequest(
  _previousState: AccessRequestActionState,
  formData: FormData
): Promise<AccessRequestActionState> {
  const parsed = accessRequestSchema.safeParse({
    email: formData.get('email'),
    phoneNumber: formData.get('phoneNumber')
  })

  if (!parsed.success) {
    const flattened = parsed.error.flatten().fieldErrors

    return {
      status: 'error',
      message: 'Please fix the highlighted fields.',
      fieldErrors: {
        email: flattened.email?.[0],
        phoneNumber: flattened.phoneNumber?.[0]
      }
    }
  }

  try {
    const user = await getCurrentUser()
    const requestHeaders = await headers()
    const userAgent = requestHeaders.get('user-agent') || null
    const now = new Date()
    const values = {
      email: parsed.data.email,
      phoneNumber: normalizeAccessRequestPhone(parsed.data.phoneNumber),
      status: 'pending',
      userId: user?.id ?? null,
      source: user ? 'signed_in_access_pending' : 'public_auth_form',
      userAgent,
      updatedAt: now,
      reviewedAt: null,
      reviewedBy: null
    }

    await db.insert(appAccessRequests).values(values).onConflictDoUpdate({
      target: appAccessRequests.email,
      set: values
    })

    revalidatePath('/admin/access')
    revalidatePath('/admin/brok')

    return {
      status: 'success',
      email: parsed.data.email,
      message: 'Access request submitted. An admin will review it soon.'
    }
  } catch (error) {
    console.error('Failed to submit access request:', error)

    return {
      status: 'error',
      message: defaultError
    }
  }
}
