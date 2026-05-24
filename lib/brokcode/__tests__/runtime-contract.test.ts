import { describe, expect, it } from 'vitest'

import {
  createBrokCodeRuntimeSpec,
  detectBrokCodePackageManager,
  detectBrokCodeRuntimeAppType,
  normalizeBrokCodeRuntimeStatus
} from '../runtime/contract'

describe('BrokCode runtime contract', () => {
  it('detects static HTML projects with managed preview fallback metadata', () => {
    const files = [
      {
        path: 'index.html',
        content: '<main>Hello</main>'
      }
    ]
    const spec = createBrokCodeRuntimeSpec({
      projectId: 'project-a',
      workspaceId: 'workspace-a',
      userId: 'user-a',
      files
    })

    expect(detectBrokCodeRuntimeAppType(files)).toBe('static_html')
    expect(spec.packageManager).toBe('none')
    expect(spec.installCommand).toBeNull()
    expect(spec.devCommand).toBe('static-preview --host 0.0.0.0')
    expect(spec.buildCommand).toBeNull()
    expect(spec.ports[0]).toMatchObject({ port: 4173, protocol: 'http' })
    expect(spec.metadata.managedStaticPreviewFallback).toBe(true)
  })

  it('detects Vite React projects and package-manager commands', () => {
    const files = [
      {
        path: 'package.json',
        content: JSON.stringify({
          scripts: {
            dev: 'vite',
            build: 'vite build'
          },
          dependencies: {
            react: '^19.0.0'
          },
          devDependencies: {
            vite: '^6.0.0'
          },
          packageManager: 'pnpm@9.0.0'
        })
      },
      {
        path: 'src/App.tsx',
        content: 'export function App() { return null }'
      }
    ]
    const appType = detectBrokCodeRuntimeAppType(files)
    const packageManager = detectBrokCodePackageManager({ files, appType })
    const spec = createBrokCodeRuntimeSpec({
      projectId: 'project-b',
      workspaceId: 'workspace-b',
      userId: 'user-b',
      versionId: 'version 1',
      files,
      status: 'running'
    })

    expect(appType).toBe('vite_react')
    expect(packageManager).toBe('pnpm')
    expect(spec.installCommand).toBe('pnpm install')
    expect(spec.devCommand).toBe('pnpm dev --host 0.0.0.0')
    expect(spec.buildCommand).toBe('pnpm build')
    expect(spec.ports[0]).toMatchObject({ port: 5173 })
    expect(spec.workspacePath).toContain('/project-b/version-1')
    expect(spec.status).toBe('running')
  })

  it('normalizes unknown runtime statuses to preparing', () => {
    expect(normalizeBrokCodeRuntimeStatus('healthy')).toBe('healthy')
    expect(normalizeBrokCodeRuntimeStatus('booting')).toBe('preparing')
  })
})
