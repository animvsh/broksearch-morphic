import { requireFeatureAccess } from '@/lib/auth/app-access'

import { BrokMailApp } from '@/components/brokmail/brokmail-app'

export default async function BrokMailPage() {
  await requireFeatureAccess('/brokmail', 'brokmail')

  return <BrokMailApp />
}
