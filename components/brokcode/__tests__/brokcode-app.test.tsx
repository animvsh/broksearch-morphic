import { describe, expect, it } from 'vitest'

import { resolveBrokCodeActiveProjectId } from '../brokcode-app'

describe('resolveBrokCodeActiveProjectId', () => {
  it('prefers the requested project when no current project is selected', () => {
    expect(
      resolveBrokCodeActiveProjectId({
        currentProjectId: '',
        requestedProjectId: 'project-2',
        projects: [{ id: 'project-1' }, { id: 'project-2' }]
      })
    ).toBe('project-2')
  })

  it('keeps the current project when it still exists', () => {
    expect(
      resolveBrokCodeActiveProjectId({
        currentProjectId: 'project-1',
        requestedProjectId: 'project-2',
        projects: [{ id: 'project-1' }, { id: 'project-2' }]
      })
    ).toBe('project-1')
  })

  it('falls back to the first project when neither current nor requested exist', () => {
    expect(
      resolveBrokCodeActiveProjectId({
        currentProjectId: 'missing-current',
        requestedProjectId: 'missing-requested',
        projects: [{ id: 'project-1' }, { id: 'project-2' }]
      })
    ).toBe('project-1')
  })
})
