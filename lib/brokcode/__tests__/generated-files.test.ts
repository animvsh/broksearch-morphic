import { describe, expect, it } from 'vitest'

import {
  buildFallbackGeneratedAppFiles,
  extractGeneratedBrokCodeFiles,
  inspectGeneratedBrokCodeAppQuality,
  prepareGeneratedBrokCodeFiles,
  shouldCreateFallbackGeneratedApp
} from '../generated-files'

describe('extractGeneratedBrokCodeFiles', () => {
  it('extracts named fenced files', () => {
    const files = extractGeneratedBrokCodeFiles(`
Here is the app.

\`\`\`tsx file=app/page.tsx
export default function Page() {
  return <main>Hello</main>
}
\`\`\`

\`\`\`css filename="app/globals.css"
main { color: red; }
\`\`\`
`)

    expect(files).toEqual([
      {
        path: 'app/page.tsx',
        content:
          'export default function Page() {\n  return <main>Hello</main>\n}',
        language: 'tsx'
      },
      {
        path: 'app/globals.css',
        content: 'main { color: red; }',
        language: 'css'
      }
    ])
  })

  it('falls back to index.html for raw html output', () => {
    const html = '<!doctype html><html><body>Hello</body></html>'

    expect(extractGeneratedBrokCodeFiles(html)).toEqual([
      {
        path: 'index.html',
        content: html,
        language: 'html'
      }
    ])
  })

  it('rejects unsafe paths', () => {
    const files = extractGeneratedBrokCodeFiles(`
\`\`\`html file=../secrets.html
bad
\`\`\`

\`\`\`js file=safe/app.js
console.log("ok")
\`\`\`
`)

    expect(files.map(file => file.path)).toEqual(['safe/app.js'])
  })

  it('adds baseline preview hygiene to weak html files', () => {
    const files = prepareGeneratedBrokCodeFiles(
      [
        {
          path: 'index.html',
          content: '<main><h1>Bakery</h1><button>Order</button></main>',
          language: 'html'
        }
      ],
      { fallbackTitle: 'Smoke Bakery' }
    )
    const html = files[0]?.content ?? ''

    expect(html).toContain('<!doctype html>')
    expect(html).toContain('name="viewport"')
    expect(html).toContain('<title>Smoke Bakery</title>')
    expect(html).toContain('box-sizing: border-box')
  })

  it('creates missing linked css and script files for complete previews', () => {
    const files = prepareGeneratedBrokCodeFiles([
      {
        path: 'index.html',
        content:
          '<!doctype html><html><head><link rel="stylesheet" href="styles.css"></head><body><main><h1>Bakery</h1><p>Fresh bread, pastry boxes, seasonal coffee, neighborhood pickup, catering trays, and weekly subscriptions.</p><form><input><button>Join</button></form><script src="app.js"></script></main></body></html>',
        language: 'html'
      }
    ])

    expect(files.map(file => file.path)).toEqual([
      'index.html',
      'styles.css',
      'app.js'
    ])
    expect(files.find(file => file.path === 'styles.css')?.content).toContain(
      'grid-template-columns'
    )
    expect(files.find(file => file.path === 'app.js')?.content).toContain(
      'DOMContentLoaded'
    )
  })

  it('keeps external referenced assets external', () => {
    const files = prepareGeneratedBrokCodeFiles([
      {
        path: 'index.html',
        content:
          '<!doctype html><html><head><link rel="stylesheet" href="https://example.com/styles.css"></head><body><main><h1>Bakery</h1><p>Fresh bread, pastry boxes, seasonal coffee, neighborhood pickup, catering trays, and weekly subscriptions.</p><form><input><button>Join</button></form><script src="//example.com/app.js"></script></main></body></html>',
        language: 'html'
      }
    ])

    expect(files.map(file => file.path)).toEqual(['index.html'])
  })

  it('builds a fallback static app only for build-like commands', () => {
    expect(shouldCreateFallbackGeneratedApp('explain this error')).toBe(false)
    expect(shouldCreateFallbackGeneratedApp('build a bakery website')).toBe(
      true
    )

    const files = buildFallbackGeneratedAppFiles({
      command: 'build a bakery website',
      fallbackTitle: 'Smoke Bakery'
    })

    expect(files.map(file => file.path)).toEqual([
      'index.html',
      'styles.css',
      'app.js'
    ])
    expect(inspectGeneratedBrokCodeAppQuality(files).issues).toEqual([])
  })

  it('reports generated app quality issues', () => {
    const weak = inspectGeneratedBrokCodeAppQuality([
      {
        path: 'index.html',
        content:
          '<!doctype html><html><body><h1>Coming soon</h1></body></html>',
        language: 'html'
      }
    ])

    expect(weak.issues).toEqual(
      expect.arrayContaining([
        'missing responsive viewport',
        'missing styling',
        'missing meaningful interaction',
        'contains placeholder copy'
      ])
    )

    const strong = inspectGeneratedBrokCodeAppQuality(
      prepareGeneratedBrokCodeFiles([
        {
          path: 'index.html',
          content:
            '<!doctype html><html><head><link rel="stylesheet" href="styles.css"></head><body><main><h1>Neighborhood bakery</h1><p>Fresh sourdough, laminated pastries, custom cakes, seasonal coffee, catering trays, order pickup windows, and a weekly subscription for regulars.</p><form><label>Email <input type="email" /></label><button>Join list</button></form></main></body></html>',
          language: 'html'
        },
        {
          path: 'styles.css',
          content: 'main { display: grid; gap: 1rem; }',
          language: 'css'
        }
      ])
    )

    expect(strong.issues).toEqual([])
  })
})
