#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'

const files = [
  'examples/api-platform/README.md',
  'examples/api-platform/.env.example',
  'examples/api-platform/node/client.mjs',
  'examples/api-platform/python/client.py'
]

const requiredMarkers = [
  '/api/v1/models',
  '/api/v1/chat/completions',
  '/api/v1/search/completions',
  'BROK_API_KEY',
  'BROK_BASE_URL'
]

const checks = []

for (const file of files) {
  const text = await readFile(file, 'utf8')
  check(text.length > 0, `${file} is not empty`)
  check(
    !/brok_sk_(?!replace|your_key)[A-Za-z0-9_-]{12,}/.test(text),
    `${file} has no committed API key`
  )
}

const readme = await readFile('examples/api-platform/README.md', 'utf8')
for (const marker of requiredMarkers) {
  check(readme.includes(marker), `README documents ${marker}`)
}

const nodeSource = await readFile(
  'examples/api-platform/node/client.mjs',
  'utf8'
)
const node = spawnSync(process.execPath, ['--check', '--input-type=module'], {
  encoding: 'utf8',
  input: nodeSource
})
check(node.status === 0, 'Node example parses', node.stderr)

const pythonCompile = spawnSync(
  'python3',
  ['-m', 'py_compile', 'examples/api-platform/python/client.py'],
  { encoding: 'utf8' }
)
if (pythonCompile.error?.code === 'ENOENT') {
  skip('Python example compile skipped because python3 is unavailable')
} else {
  check(
    pythonCompile.status === 0,
    'Python example compiles',
    pythonCompile.stderr
  )
}

finish()

function check(ok, name, details = '') {
  checks.push({ ok, name, details, skipped: false })
  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${name}${details ? ` | ${details.trim()}` : ''}`
  )
}

function skip(name) {
  checks.push({ ok: true, name, details: '', skipped: true })
  console.log(`SKIP ${name}`)
}

function finish() {
  const failed = checks.filter(item => !item.ok)
  const skipped = checks.filter(item => item.skipped)
  if (failed.length > 0) {
    console.log(
      `\nAPI platform example check failed: ${failed.length} issue(s).`
    )
    process.exit(1)
  }
  console.log(
    `\nAPI platform example check passed: ${checks.length - skipped.length} checks${
      skipped.length ? `, ${skipped.length} skipped` : ''
    }.`
  )
}
