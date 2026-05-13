import { requirePageAuth } from '@/lib/auth/require-page-auth'

import { BrokMailApp } from '@/components/brokmail/brokmail-app'

export default async function BrokMailPage() {
  await requirePageAuth('/brokmail')

  return <BrokMailApp />
}
