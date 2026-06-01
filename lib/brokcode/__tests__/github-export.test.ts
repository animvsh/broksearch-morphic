import { describe, expect, it } from 'vitest'

import {
  addGithubExportSupportFiles,
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

  it('adds handoff files required for a deployable export package', () => {
    const files = addGithubExportSupportFiles({
      exportPath: 'student/app',
      projectName: 'AI Study Coach',
      projectId: 'project_123',
      previewUrl: 'https://brok.test/api/brokcode/previews/project_123',
      deploymentUrl: 'https://brok.test/brokcode/apps/study-coach',
      backend: {
        provider: 'insforge',
        status: 'ready',
        projectUrl: 'https://insforge.test/project',
        appkey: 'public-app-key',
        encryptedAdminKey: 'secret-ciphertext',
        adminKeyConfigured: true
      },
      files: normalizeGithubExportFiles({
        exportPath: 'student/app',
        files: [{ path: 'index.html', content: '<main />' }]
      })
    })

    expect(files.map(file => file.path)).toEqual([
      'student/app/.env.example',
      'student/app/DEPLOYMENT.md',
      'student/app/index.html',
      'student/app/insforge/config.json',
      'student/app/README.md'
    ])
    expect(
      files.find(file => file.path.endsWith('README.md'))?.content
    ).toContain('AI Study Coach')
    expect(
      files.find(file => file.path.endsWith('DEPLOYMENT.md'))?.content
    ).toContain('Smoke-test the deployed URL')
    expect(
      files.find(file => file.path.endsWith('insforge/config.json'))?.content
    ).not.toContain('secret-ciphertext')
    expect(
      files.find(file => file.path.endsWith('insforge/config.json'))?.content
    ).toContain('[redacted]')
  })

  it('does not overwrite existing export handoff files', () => {
    const files = addGithubExportSupportFiles({
      files: [
        { path: 'README.md', content: 'Custom readme' },
        { path: '.env.example', content: 'CUSTOM=value' },
        { path: 'DEPLOYMENT.md', content: 'Custom deploy' },
        { path: 'insforge/config.json', content: '{"custom":true}' },
        { path: 'index.html', content: '<main />' }
      ]
    })

    expect(files).toHaveLength(5)
    expect(files.find(file => file.path === 'README.md')?.content).toBe(
      'Custom readme'
    )
  })
})
