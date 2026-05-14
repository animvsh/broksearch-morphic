'use server'

import { headers } from 'next/headers'

import { z } from 'zod'

import { featureRequests, generateId } from '@/lib/db/schema'
import { withOptionalRLS } from '@/lib/db/with-rls'
import { createClient } from '@/lib/supabase/server'

const featureRequestSchema = z.object({
  request: z.string().trim().min(3).max(4000),
  pageUrl: z.string().trim().min(1).max(2048)
})

export async function submitFeatureRequest(input: {
  request: string
  pageUrl: string
}) {
  const parsed = featureRequestSchema.safeParse(input)

  if (!parsed.success) {
    return {
      success: false as const,
      error: 'Please describe the feature in a little more detail.'
    }
  }

  try {
    let userId: string | undefined
    let accountEmail: string | undefined
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (supabaseUrl && supabaseAnonKey) {
      const supabase = await createClient()
      const {
        data: { user }
      } = await supabase.auth.getUser()

      userId = user?.id
      accountEmail = user?.email
    }

    const authExplicitlyEnabled = process.env.ENABLE_AUTH === 'true'
    const cloudDeployment = process.env.BROK_CLOUD_DEPLOYMENT === 'true'

    if (!userId && !authExplicitlyEnabled && !cloudDeployment) {
      userId =
        process.env.ANONYMOUS_USER_ID || '00000000-0000-0000-0000-000000000000'
    }

    const requestHeaders = await headers()
    const userAgent = requestHeaders.get('user-agent') || undefined
    const id = generateId()

    await withOptionalRLS(userId || null, async tx => {
      await tx.insert(featureRequests).values({
        id,
        userId,
        accountEmail,
        request: parsed.data.request,
        pageUrl: parsed.data.pageUrl,
        userAgent
      })
    })

    return { success: true as const, id }
  } catch (error) {
    console.error('Failed to submit feature request:', error)
    return {
      success: false as const,
      error: 'Failed to submit feature request'
    }
  }
}
