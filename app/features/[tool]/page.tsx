import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import {
  getToolFeature,
  TOOL_FEATURES,
  ToolFeaturePage
} from '@/components/brok/tool-feature-page'

type ToolFeaturePageProps = {
  params: Promise<{ tool: string }>
}

export function generateStaticParams() {
  return TOOL_FEATURES.map(feature => ({ tool: feature.slug }))
}

export async function generateMetadata({
  params
}: ToolFeaturePageProps): Promise<Metadata> {
  const { tool } = await params
  const feature = getToolFeature(tool)

  if (!feature) return { title: 'Feature not found' }

  return {
    title: feature.eyebrow,
    description: feature.subtitle
  }
}

export default async function FeatureToolPage({
  params
}: ToolFeaturePageProps) {
  const { tool } = await params
  const feature = getToolFeature(tool)

  if (!feature) notFound()

  return <ToolFeaturePage feature={feature} />
}
