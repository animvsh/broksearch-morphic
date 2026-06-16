import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { WorkspaceHeader } from '../build-workspace'

describe('WorkspaceHeader', () => {
  it('keeps deploy and export disabled until a persisted project exists', () => {
    const onDeploy = vi.fn()

    render(
      <WorkspaceHeader
        projectName="Anonymous Scaffold"
        phase="ready"
        progress={100}
        previewUrl={null}
        deploymentUrl={null}
        deployStatus="idle"
        deployMessage={null}
        backendStatus="idle"
        backendMessage={null}
        projectId={null}
        onDeploy={onDeploy}
        onProvisionBackend={() => undefined}
        onRestart={() => undefined}
      />
    )

    const deployButton = screen.getByRole('button', { name: 'Publish' })
    fireEvent.click(deployButton)

    expect(deployButton).toBeDisabled()
    expect(onDeploy).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Backend' })).toBeDisabled()
    expect(screen.getByRole('link', { name: 'Export' })).toHaveAttribute(
      'aria-disabled',
      'true'
    )
  })

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
        backendStatus="idle"
        backendMessage={null}
        projectId="project-1"
        onDeploy={onDeploy}
        onProvisionBackend={() => undefined}
        onRestart={() => undefined}
      />
    )

    const deployButton = screen.getByRole('button', { name: 'Publish' })
    fireEvent.click(deployButton)

    expect(onDeploy).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('link', { name: 'Published app' })).not.toBeInTheDocument()
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
        backendStatus="ready"
        backendMessage="InsForge backend connected."
        projectId="project-1"
        onDeploy={() => undefined}
        onProvisionBackend={() => undefined}
        onRestart={() => undefined}
      />
    )

    expect(screen.getByRole('button', { name: 'Published' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Published app' })).toHaveAttribute(
      'href',
      '/brokcode/apps/project-1/'
    )
  })

  it('shows deploy failures inline instead of only in a tooltip', () => {
    render(
      <WorkspaceHeader
        projectName="CRM Builder"
        phase="ready"
        progress={100}
        previewUrl="/api/brokcode/previews/project-1"
        deploymentUrl={null}
        deployStatus="failed"
        deployMessage="Project files are missing."
        backendStatus="idle"
        backendMessage={null}
        projectId="project-1"
        onDeploy={() => undefined}
        onProvisionBackend={() => undefined}
        onRestart={() => undefined}
      />
    )

    expect(screen.getByRole('button', { name: 'Retry publish' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Project files are missing.'
    )
  })

  it('triggers backend provisioning from a persisted project', () => {
    const onProvisionBackend = vi.fn()

    render(
      <WorkspaceHeader
        projectName="CRM Builder"
        phase="ready"
        progress={100}
        previewUrl="/api/brokcode/previews/project-1"
        deploymentUrl={null}
        deployStatus="idle"
        deployMessage={null}
        backendStatus="idle"
        backendMessage={null}
        projectId="project-1"
        onDeploy={() => undefined}
        onProvisionBackend={onProvisionBackend}
        onRestart={() => undefined}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Backend' }))

    expect(onProvisionBackend).toHaveBeenCalledTimes(1)
  })
})
