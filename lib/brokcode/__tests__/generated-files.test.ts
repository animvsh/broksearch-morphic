import { describe, expect, it } from 'vitest'

import { extractGeneratedBrokCodeFiles } from '../generated-files'

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
})
