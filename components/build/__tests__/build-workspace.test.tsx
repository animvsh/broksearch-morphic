import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { WorkspaceHeader } from '../build-workspace'

describe('WorkspaceHeader', () => {
  it('triggers deploy as an action instead of opening the preview link', () => {
    const onDeploy = vi.fn()

    render(
      <WorkspaceHeader
        projectName="CRM Builder"
        phase="ready"
        progress={100}
        previewUrl="/api/brokcode/previews/project-1"
        deploymentUrl={null}
        deployStatus="idle"
        deployMessage={null}
        projectId="project-1"
        onDeploy={onDeploy}
        onRestart={() => undefined}
      />
    )

    const deployButton = screen.getByRole('button', { name: 'Deploy' })
    fireEvent.click(deployButton)

    expect(onDeploy).toHaveBeenCalledTimes(1)
    expect(
      screen.queryByRole('link', { name: 'Live' })
    ).not.toBeInTheDocument()
  })

  it('shows a separate live link only after deploy returns a URL', () => {
    render(
      <WorkspaceHeader
        projectName="CRM Builder"
        phase="ready"
        progress={100}
        previewUrl="/api/brokcode/previews/project-1"
        deploymentUrl="/brokcode/apps/project-1/"
        deployStatus="live"
        deployMessage="Published"
        projectId="project-1"
        onDeploy={() => undefined}
        onRestart={() => undefined}
      />
    )

    expect(screen.getByRole('button', { name: 'Published' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Live' })).toHaveAttribute(
      'href',
      '/brokcode/apps/project-1/'
    )
  })
})
