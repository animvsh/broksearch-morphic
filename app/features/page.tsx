import type { Metadata } from 'next'

import { FeaturesIndexPage } from '@/components/brok/tool-feature-page'

export const metadata: Metadata = {
  title: 'Brok Features',
  description:
    'Explore Brok Search, BrokCode, BrokMail, Presentations, and the API Platform.'
}

export default function FeaturesPage() {
  return <FeaturesIndexPage />
}
