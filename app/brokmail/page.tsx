import { requireAppAccess } from '@/lib/auth/app-access'

import { BrokMailApp } from '@/components/brokmail/brokmail-app'

export default async function BrokMailPage() {
  await requireAppAccess('/brokmail')

  return <BrokMailApp />
}
