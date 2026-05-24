import { describe, expect, it } from 'vitest'

import { createInsForgeBackendMetadata } from '../backend-provider'
import { buildBrokCodeProjectContextPack } from '../context-packer'

const project = {
  id: 'project-1',
  name: 'Student Planner',
  slug: 'student-planner',
  status: 'draft',
  previewUrl: 'https://brok.test/api/brokcode/previews/project-1/index.html',
  deploymentUrl: null,
  metadata: {
    preview: {
      mode: 'managed_static',
      fileCount: 3,
      generatedAt: '2026-05-24T00:00:00.000Z'
    }
  }
}

describe('BrokCode project context packer', () => {
  it('packs static apps with tree, preview state, and selected files', () => {
    const pack = buildBrokCodeProjectContextPack({
      project,
      files: [
        {
          path: 'index.html',
          language: 'html',
          content: '<!doctype html><html><body><h1>Planner</h1></body></html>'
        },
        {
          path: 'styles.css',
          language: 'css',
          content: 'body { color: #111; }'
        }
      ],
      priorRequests: ['Add a study dashboard']
    })

    expect(pack).toContain('App shape: Static app')
    expect(pack).toContain('- index.html (included)')
    expect(pack).toContain('Prior requested changes:')
    expect(pack).toContain('Preserve existing working behavior')
  })

  it('prioritizes Vite entry files and redacts secrets', () => {
    const pack = buildBrokCodeProjectContextPack({
      project,
      files: [
        {
          path: 'src/main.tsx',
          language: 'tsx',
          content: 'import App from "./App"'
        },
        {
          path: 'src/App.tsx',
          language: 'tsx',
          content: 'export default function App() { return <main /> }'
        },
        {
          path: '.env',
          language: null,
          content: 'OPENAI_API_KEY=sk-live-secret'
        }
      ],
      recentErrors: ['token: should-not-leak at /src/App.tsx:4:2']
    })

    expect(pack).toContain('App shape: Vite app')
    expect(pack).toContain('src/main.tsx (included)')
    expect(pack).toContain('Secret/private files excluded: .env')
    expect(pack).not.toContain('sk-live-secret')
    expect(pack).toContain('token=[redacted]')
  })

  it('summarizes full-stack projects with backend state', () => {
    const backend = createInsForgeBackendMetadata({
      status: 'ready',
      projectUrl: 'https://backend.test',
      adminKey: 'ik_live_secret'
    })
    const pack = buildBrokCodeProjectContextPack({
      project,
      backend,
      activeVersionId: 'version-123',
      currentRoute: '/dashboard',
      files: [
        {
          path: 'app/page.tsx',
          language: 'tsx',
          content: 'export default function Page() { return <main /> }'
        },
        {
          path: 'app/api/tasks/route.ts',
          language: 'ts',
          content: 'export async function GET() { return Response.json([]) }'
        }
      ]
    })

    expect(pack).toContain('App shape: Next/full-stack')
    expect(pack).toContain('Backend: insforge (ready')
    expect(pack).toContain('Current route: /dashboard')
    expect(pack).toContain('Active version: version-123')
    expect(pack).not.toContain('ik_live_secret')
  })

  it('truncates broken-build projects deterministically', () => {
    const pack = buildBrokCodeProjectContextPack({
      project,
      recentErrors: ['Build failed in src/App.tsx: Unexpected token'],
      files: Array.from({ length: 30 }, (_, index) => ({
        path: `src/components/Panel${index}.tsx`,
        language: 'tsx',
        content: `export function Panel${index}(){ return <section>${'x'.repeat(900)}</section> }`
      }))
    })

    expect(pack).toContain('Recent errors:')
    expect(pack).toContain('Selected important files only')
    expect(pack.length).toBeLessThanOrEqual(12100)
  })
})
