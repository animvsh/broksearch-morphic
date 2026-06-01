import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createBrokCodeRuntimeSpec } from '../runtime/contract'
import {
  BrokCodeRuntimeWorkspaceError,
  materializeBrokCodeRuntimeWorkspace
} from '../runtime/workspace'

const projectId = '00000000-0000-0000-0000-000000000201'
const workspaceId = '00000000-0000-0000-0000-000000000202'
const userId = 'user-runtime-workspace-test'

let workspaceRoot: string

describe('BrokCode runtime workspace materialization', () => {
  beforeEach(async () => {
    workspaceRoot = await mkdtemp(path.join(tmpdir(), 'brokcode-workspace-'))
    process.env.BROKCODE_RUNTIME_WORKSPACE_DIR = workspaceRoot
  })

  afterEach(async () => {
    delete process.env.BROKCODE_RUNTIME_WORKSPACE_DIR
    await rm(workspaceRoot, { recursive: true, force: true })
  })

  it('writes static project files and a checksum manifest', async () => {
    const files = [
      {
        path: 'index.html',
        content: '<main>Student app</main>'
      }
    ]
    const spec = createBrokCodeRuntimeSpec({
      projectId,
      workspaceId,
      userId,
      files
    })
    const workspace = await materializeBrokCodeRuntimeWorkspace({
      spec,
      files,
      projectName: 'Student App'
    })

    await expect(
      stat(path.join(workspace.workspacePath, 'index.html'))
    ).resolves.toBeTruthy()
    const manifest = JSON.parse(
      await readFile(
        path.join(workspace.workspacePath, '.brokcode', 'manifest.json'),
        'utf8'
      )
    )
    expect(manifest).toMatchObject({
      appType: 'static_html',
      activeEntrypoint: 'index.html',
      totalBytes: files[0].content.length
    })
    expect(manifest.files[0].sha256).toHaveLength(64)
  })

  it('adds missing Vite package, index, and main files', async () => {
    const files = [
      {
        path: 'src/App.tsx',
        content: 'export function App() { return <main>Hi</main> }'
      }
    ]
    const spec = createBrokCodeRuntimeSpec({
      projectId,
      workspaceId,
      userId,
      files
    })
    const workspace = await materializeBrokCodeRuntimeWorkspace({
      spec,
      files,
      projectName: 'Vite App'
    })

    const packageJson = JSON.parse(
      await readFile(path.join(workspace.workspacePath, 'package.json'), 'utf8')
    )
    expect(packageJson.scripts).toMatchObject({
      dev: 'vite --host 0.0.0.0',
      build: 'vite build'
    })
    await expect(
      stat(path.join(workspace.workspacePath, 'index.html'))
    ).resolves.toBeTruthy()
    await expect(
      stat(path.join(workspace.workspacePath, 'src', 'main.tsx'))
    ).resolves.toBeTruthy()
    expect(workspace.manifest.generatedFiles).toEqual([
      'package.json',
      'index.html',
      'src/main.tsx'
    ])
  })

  it('fills missing package scripts for existing Next.js package files', async () => {
    const files = [
      {
        path: 'package.json',
        content: JSON.stringify({ dependencies: { next: 'latest' } })
      },
      {
        path: 'app/page.tsx',
        content: 'export default function Page() { return <main /> }'
      }
    ]
    const spec = createBrokCodeRuntimeSpec({
      projectId,
      workspaceId,
      userId,
      files
    })
    const workspace = await materializeBrokCodeRuntimeWorkspace({
      spec,
      files,
      projectName: 'Next App'
    })
    const packageJson = JSON.parse(
      await readFile(path.join(workspace.workspacePath, 'package.json'), 'utf8')
    )

    expect(workspace.manifest.appType).toBe('nextjs')
    expect(packageJson.scripts).toMatchObject({
      dev: 'next dev -H 0.0.0.0',
      build: 'next build'
    })
  })

  it('updates files incrementally so live runtime dependencies survive edits', async () => {
    const firstFiles = [
      { path: 'index.html', content: '<main>First</main>' },
      { path: 'style.css', content: 'main { color: red; }' }
    ]
    const spec = createBrokCodeRuntimeSpec({
      projectId,
      workspaceId,
      userId,
      files: firstFiles
    })
    const first = await materializeBrokCodeRuntimeWorkspace({
      spec,
      files: firstFiles,
      projectName: 'Hot Reload App'
    })
    await mkdir(path.join(first.workspacePath, 'node_modules', '.vite'), {
      recursive: true
    })
    await writeFile(
      path.join(first.workspacePath, 'node_modules', '.vite', 'cache.json'),
      '{}',
      'utf8'
    )

    const secondFiles = [{ path: 'index.html', content: '<main>Second</main>' }]
    const second = await materializeBrokCodeRuntimeWorkspace({
      spec,
      files: secondFiles,
      projectName: 'Hot Reload App'
    })

    await expect(
      readFile(path.join(second.workspacePath, 'index.html'), 'utf8')
    ).resolves.toBe('<main>Second</main>')
    await expect(
      stat(path.join(second.workspacePath, 'style.css'))
    ).rejects.toBeTruthy()
    await expect(
      stat(
        path.join(second.workspacePath, 'node_modules', '.vite', 'cache.json')
      )
    ).resolves.toBeTruthy()
  })

  it('rejects unsafe, binary, and huge files', async () => {
    const spec = createBrokCodeRuntimeSpec({
      projectId,
      workspaceId,
      userId,
      files: [{ path: 'index.html', content: '<main />' }]
    })

    await expect(
      materializeBrokCodeRuntimeWorkspace({
        spec,
        files: [{ path: '../.env', content: 'SECRET=value' }]
      })
    ).rejects.toThrow(BrokCodeRuntimeWorkspaceError)

    await expect(
      materializeBrokCodeRuntimeWorkspace({
        spec,
        files: [{ path: 'image.png', content: 'abc\0def' }]
      })
    ).rejects.toThrow('binary')

    await expect(
      materializeBrokCodeRuntimeWorkspace({
        spec,
        files: [{ path: 'large.txt', content: 'x'.repeat(1024 * 1024 + 1) }]
      })
    ).rejects.toThrow('too large')
  })
})
