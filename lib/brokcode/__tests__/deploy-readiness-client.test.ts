import { describe, expect, it } from 'vitest'

import {
  type BrokCodeManagedDeployReadiness,
  summarizeBrokCodeDeployReadiness
} from '../deploy-readiness-client'

const baseReadiness: BrokCodeManagedDeployReadiness = {
  ready: true,
  status: 'ready',
  message: 'BrokCode app is ready to publish on its managed URL.',
  strategy: 'managed_live_preview',
  previewUrl: 'https://www.brok.fyi/api/brokcode/previews/project/index.html',
  deploymentUrl:
    'https://www.brok.fyi/brokcode/apps/student-app--project/index.html',
  fileCount: 3,
  requiredFiles: [],
  quality: {
    hasHtmlEntry: true,
    hasViewport: true,
    hasTitle: true,
    hasStyling: true,
    hasInteraction: true,
    hasEnoughVisibleCopy: true,
    hasPlaceholderCopy: false,
    issues: []
  }
}

describe('summarizeBrokCodeDeployReadiness', () => {
  it('shows a ready state before the first deployment', () => {
    expect(
      summarizeBrokCodeDeployReadiness({
        hasProject: true,
        loading: false,
        readiness: baseReadiness
      })
    ).toMatchObject({
      label: 'Ready',
      tone: 'ready'
    })
  })

  it('keeps the live label when deployment history has a deployed record', () => {
    expect(
      summarizeBrokCodeDeployReadiness({
        hasProject: true,
        loading: false,
        readiness: baseReadiness,
        latestDeployment: {
          id: 'deployment_1',
          provider: 'managed_preview',
          status: 'deployed',
          url: baseReadiness.deploymentUrl
        }
      })
    ).toMatchObject({
      label: 'Live',
      tone: 'ready'
    })
  })

  it('turns blocking readiness into student-readable status copy', () => {
    expect(
      summarizeBrokCodeDeployReadiness({
        hasProject: true,
        loading: false,
        readiness: {
          ...baseReadiness,
          ready: false,
          status: 'missing_entrypoint',
          message:
            'BrokCode cannot publish this project yet because it does not have a renderable index.html.',
          requiredFiles: ['index.html']
        }
      })
    ).toMatchObject({
      label: 'Missing app',
      tone: 'blocked'
    })
  })
})
