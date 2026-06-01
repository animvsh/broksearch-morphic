import { describe, expect, it } from 'vitest'

import {
  normalizeBrokCodeGeneratedFilePaths,
  shouldRefreshBrokCodeProjectAfterServerRun
} from '../run-sync'

describe('BrokCode browser run sync helpers', () => {
  it('normalizes server generated file paths', () => {
    expect(
      normalizeBrokCodeGeneratedFilePaths([
        ' index.html ',
        '',
        'src/App.tsx',
        'index.html',
        null,
        42
      ])
    ).toEqual(['index.html', 'src/App.tsx'])
  })

  it('refreshes project files when the server persisted the run output', () => {
    expect(
      shouldRefreshBrokCodeProjectAfterServerRun({
        generatedFilesCount: 0,
        serverFileChangesCount: 2,
        serverGeneratedFilePathsCount: 0
      })
    ).toBe(true)

    expect(
      shouldRefreshBrokCodeProjectAfterServerRun({
        generatedFilesCount: 0,
        serverFileChangesCount: 0,
        serverGeneratedFilePathsCount: 3
      })
    ).toBe(true)
  })

  it('does not double-save files already extracted in the browser', () => {
    expect(
      shouldRefreshBrokCodeProjectAfterServerRun({
        generatedFilesCount: 2,
        serverFileChangesCount: 2,
        serverGeneratedFilePathsCount: 2
      })
    ).toBe(false)
  })
})
