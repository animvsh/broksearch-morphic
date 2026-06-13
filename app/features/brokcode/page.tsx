import { notFound } from 'next/navigation'

import {
  getToolFeature,
  ToolFeaturePage
} from '@/components/brok/tool-feature-page'

const feature = getToolFeature('brokcode')

export const metadata = {
  title: feature?.eyebrow ?? 'Brok feature',
  description: feature?.subtitle ?? 'Brok feature page.'
}

export default function FeatureLandingPage() {
  if (!feature) {
    notFound()
  }

  return <ToolFeaturePage feature={feature} />
}
