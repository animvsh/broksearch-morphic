import { db } from '@/lib/db'
import { brokMailApprovalConsumptions } from '@/lib/db/schema'

import type { BrokMailSignedApproval } from './action-approval'

export async function consumeBrokMailApproval({
  userId,
  approval
}: {
  userId: string
  approval: BrokMailSignedApproval
}) {
  const [consumed] = await db
    .insert(brokMailApprovalConsumptions)
    .values({
      approvalId: approval.id,
      userId,
      action: approval.action,
      payloadHash: approval.payloadHash
    })
    .onConflictDoNothing()
    .returning({ id: brokMailApprovalConsumptions.id })

  return Boolean(consumed)
}
