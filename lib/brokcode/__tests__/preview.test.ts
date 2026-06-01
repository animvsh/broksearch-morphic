import { describe, expect, it } from 'vitest'

import { getBrokCodeManagedDeployReadiness } from '../deploy-readiness'
import {
  getManagedPreviewAsset,
  getManagedPreviewAssetOrPlaceholder,
  hasRenderableManagedPreview,
  makeManagedDeploymentUrl,
  makeManagedPreviewUrl,
  managedPreviewSecurityHeaders,
  normalizeManagedPreviewPath,
  resolvePublicPreviewOrigin
} from '../preview'

const project = {
  id: 'project_123',
  name: 'Coffee Shop',
  slug: 'coffee-shop'
}

describe('BrokCode managed preview', () => {
  it('serves saved index.html as a managed preview asset', () => {
    const asset = getManagedPreviewAsset({
      project,
      pathParts: ['index.html'],
      files: [
        {
          path: 'index.html',
          content: '<h1>Coffee Shop</h1>',
          language: 'html'
        }
      ]
    })

    expect(asset?.content).toContain('<h1>Coffee Shop</h1>')
    expect(asset?.content).toContain('data-brokcode-hot-reload')
    expect(asset?.content).toContain('data-brokcode-brand-badge')
    expect(asset?.content).toContain('Built with Brok')
    expect(asset?.isHtml).toBe(true)
    expect(asset).toMatchObject({
      contentType: 'text/html; charset=utf-8',
      path: 'index.html',
      status: 200
    })
  })

  it('does not duplicate the built with Brok badge when html is already branded', () => {
    const asset = getManagedPreviewAsset({
      project,
      pathParts: ['index.html'],
      files: [
        {
          path: 'index.html',
          content:
            '<!doctype html><html><body><h1>Coffee Shop</h1><a data-brokcode-brand-badge>Built with Brok</a></body></html>',
          language: 'html'
        }
      ]
    })

    const badgeMatches =
      asset?.content.match(/data-brokcode-brand-badge/g) ?? []
    expect(badgeMatches).toHaveLength(1)
  })

  it('does not treat a placeholder as a renderable managed preview asset', () => {
    const files = [
      {
        path: 'app/page.tsx',
        content: 'export default function Page() { return <main /> }',
        language: 'tsx'
      }
    ]

    expect(hasRenderableManagedPreview(files)).toBe(false)
    expect(
      getManagedPreviewAsset({
        project,
        pathParts: ['index.html'],
        files
      })
    ).toBeNull()

    const placeholder = getManagedPreviewAssetOrPlaceholder({
      project,
      pathParts: ['index.html'],
      files
    })
    expect(placeholder?.content).toContain('BrokCode Cloud preview is ready')
    expect(placeholder?.content).toContain('Built with Brok')
  })

  it('adds restrictive security headers for generated html', () => {
    const headers = managedPreviewSecurityHeaders({
      contentType: 'text/html; charset=utf-8',
      isHtml: true
    })

    expect(headers['Content-Security-Policy']).toContain("default-src 'none'")
    expect(headers['Content-Security-Policy']).toContain(
      "frame-ancestors 'self'"
    )
    expect(headers['Content-Security-Policy']).toContain(
      "script-src 'self' 'unsafe-inline'"
    )
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
  })

  it('blocks traversal paths before file lookup', () => {
    expect(normalizeManagedPreviewPath(['..', '.env'])).toBeNull()
    expect(
      getManagedPreviewAsset({
        project,
        pathParts: ['..', '.env'],
        files: [
          {
            path: '.env',
            content: 'SECRET=value'
          }
        ]
      })
    ).toBeNull()
  })

  it('generates a stable same-origin preview URL', () => {
    expect(
      makeManagedPreviewUrl({
        origin: 'https://www.brok.fyi/',
        projectId: 'project_123'
      })
    ).toBe('https://www.brok.fyi/api/brokcode/previews/project_123/index.html')
  })

  it('generates a public managed deployment URL from the project handle', () => {
    expect(
      makeManagedDeploymentUrl({
        origin: 'https://www.brok.fyi/',
        project
      })
    ).toBe(
      'https://www.brok.fyi/brokcode/apps/coffee-shop--project_123/index.html'
    )
  })

  it('summarizes managed deploy readiness for the right panel', () => {
    const request = {
      url: 'https://www.brok.fyi/api/brokcode/deploy',
      headers: new Headers()
    }

    expect(
      getBrokCodeManagedDeployReadiness({
        project,
        request,
        files: []
      })
    ).toMatchObject({
      ready: false,
      status: 'missing_entrypoint',
      requiredFiles: ['index.html'],
      previewUrl:
        'https://www.brok.fyi/api/brokcode/previews/project_123/index.html',
      deploymentUrl:
        'https://www.brok.fyi/brokcode/apps/coffee-shop--project_123/index.html'
    })

    expect(
      getBrokCodeManagedDeployReadiness({
        project,
        request,
        files: [
          {
            path: 'index.html',
            content:
              '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Coffee Shop</title><style>body{font-family:system-ui}.hero{padding:48px}.card{border:1px solid #ddd}</style></head><body><main class="hero"><h1>Coffee Shop</h1><p>Order fresh espresso, pastries, and campus-friendly study snacks from a polished student coffee shop app. Browse featured drinks, save favorites, and start a pickup order before class.</p><button>Order now</button></main></body></html>'
          }
        ]
      })
    ).toMatchObject({
      ready: true,
      status: 'ready',
      strategy: 'managed_live_preview',
      requiredFiles: []
    })
  })

  it('serves the hot reload manifest for managed previews', () => {
    const asset = getManagedPreviewAsset({
      project,
      pathParts: ['__brokcode_hot.json'],
      files: [
        {
          path: 'index.html',
          content: '<h1>Coffee Shop</h1>',
          language: 'html',
          updatedAt: '2026-05-19T00:00:00.000Z'
        }
      ]
    })

    expect(asset).toMatchObject({
      contentType: 'application/json; charset=utf-8',
      path: '__brokcode_hot.json',
      status: 200
    })
    expect(JSON.parse(asset?.content ?? '{}')).toMatchObject({
      fileCount: 1,
      projectId: project.id,
      slug: project.slug
    })
  })

  it('uses forwarded public host instead of Railway bind address', () => {
    expect(
      resolvePublicPreviewOrigin({
        url: 'https://0.0.0.0:8080/api/brokcode/execute',
        headers: new Headers({
          'x-forwarded-host': 'www.brok.fyi',
          'x-forwarded-proto': 'https'
        })
      })
    ).toBe('https://www.brok.fyi')
  })
})
