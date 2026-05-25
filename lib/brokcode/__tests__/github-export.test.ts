import { describe, expect, it } from 'vitest'

import {
  buildGithubExportBranchName,
  buildGithubExportCommitMessage,
  buildGithubExportPullRequestBody,
  normalizeGithubExportFiles,
  sanitizeGithubExportPath
} from '../github-export'

describe('BrokCode GitHub export helpers', () => {
  it('normalizes project files under a safe export path', () => {
    expect(
      normalizeGithubExportFiles({
        exportPath: '/student/apps/final/',
        files: [
          { path: 'index.html', content: '<main>Hello</main>' },
          { path: './src/App.tsx', content: 'export function App() {}' },
          { path: '../secret.txt', content: 'nope' },
          { path: 'node_modules/pkg/index.js', content: 'nope' }
        ]
      })
    ).toEqual([
      {
        path: 'student/apps/final/index.html',
        content: '<main>Hello</main>'
      },
      {
        path: 'student/apps/final/src/App.tsx',
        content: 'export function App() {}'
      }
    ])
  })

  it('rejects unsafe export path segments', () => {
    expect(sanitizeGithubExportPath('../repo')).toBe('')
    expect(sanitizeGithubExportPath('apps/.git/hooks')).toBe('')
    expect(sanitizeGithubExportPath('apps/final')).toBe('apps/final')
  })

  it('builds deterministic branch, commit, and PR body metadata', () => {
    expect(
      buildGithubExportBranchName({
        projectName: 'My Student App',
        projectId: 'project_123456789'
      })
    ).toBe('brokcode/my-student-app-23456789')

    expect(
      buildGithubExportCommitMessage({
        projectId: 'project_123',
        versionId: 'version_456'
      })
    ).toBe(
      'Export BrokCode project - project project_123 - version version_456'
    )

    expect(
      buildGithubExportPullRequestBody({
        body: 'Ready for review.',
        projectId: 'project_123',
        versionId: 'version_456',
        exportPath: 'student/app',
        files: [{ path: 'student/app/index.html', content: '<main />' }]
      })
    ).toContain('- Files committed: 1')
  })
})
