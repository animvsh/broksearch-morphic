import { describe, expect, it } from 'vitest'

import {
  applyBrokCodeFileOperations,
  BrokCodeFileOperationError,
  checksumBrokCodeFileContent,
  summarizeBrokCodeFullFileChanges
} from '../file-operations'

const files = [
  {
    path: 'src/App.tsx',
    language: 'tsx',
    content: 'export default function App() { return <main>Old</main> }'
  },
  {
    path: 'styles.css',
    language: 'css',
    content: 'body { color: black; }'
  }
]

describe('BrokCode file operations', () => {
  it('applies create, replace, and patch operations with checksums', () => {
    const checksum = checksumBrokCodeFileContent(files[0].content)
    const result = applyBrokCodeFileOperations({
      files,
      operations: [
        {
          type: 'patch_file',
          path: 'src/App.tsx',
          expectedChecksum: checksum,
          search: 'Old',
          replace: 'New',
          summary: 'Update headline'
        },
        {
          type: 'create_file',
          path: 'README.md',
          content: '# Student Planner'
        }
      ]
    })

    expect(
      result.files.find(file => file.path === 'src/App.tsx')?.content
    ).toContain('New')
    expect(result.files.find(file => file.path === 'README.md')).toBeTruthy()
    expect(result.changes[0]).toMatchObject({
      type: 'patch_file',
      beforeChecksum: checksum,
      summary: 'Update headline'
    })
  })

  it('detects stale file conflicts', () => {
    expect(() =>
      applyBrokCodeFileOperations({
        files,
        operations: [
          {
            type: 'replace_file',
            path: 'src/App.tsx',
            expectedChecksum: 'stale',
            content: 'changed'
          }
        ]
      })
    ).toThrow(BrokCodeFileOperationError)

    try {
      applyBrokCodeFileOperations({
        files,
        operations: [
          {
            type: 'replace_file',
            path: 'src/App.tsx',
            expectedChecksum: 'stale',
            content: 'changed'
          }
        ]
      })
    } catch (error) {
      expect(error).toBeInstanceOf(BrokCodeFileOperationError)
      expect((error as BrokCodeFileOperationError).code).toBe('conflict')
      expect((error as BrokCodeFileOperationError).conflicts[0].path).toBe(
        'src/App.tsx'
      )
    }
  })

  it('rejects invalid patches', () => {
    expect(() =>
      applyBrokCodeFileOperations({
        files,
        operations: [
          {
            type: 'patch_file',
            path: 'src/App.tsx',
            search: 'Missing text',
            replace: 'New text'
          }
        ]
      })
    ).toThrow(/search text was not found/)
  })

  it('handles delete and rename operations', () => {
    const result = applyBrokCodeFileOperations({
      files,
      operations: [
        {
          type: 'delete_file',
          path: 'styles.css'
        },
        {
          type: 'rename_file',
          fromPath: 'src/App.tsx',
          toPath: 'src/MainApp.tsx'
        }
      ]
    })

    expect(result.files.some(file => file.path === 'styles.css')).toBe(false)
    expect(result.files.some(file => file.path === 'src/MainApp.tsx')).toBe(
      true
    )
    expect(result.changes.map(change => change.type)).toEqual([
      'delete_file',
      'rename_file'
    ])
  })

  it('prevents renames from overwriting an existing file', () => {
    expect(() =>
      applyBrokCodeFileOperations({
        files,
        operations: [
          {
            type: 'rename_file',
            fromPath: 'src/App.tsx',
            toPath: 'styles.css'
          }
        ]
      })
    ).toThrow(BrokCodeFileOperationError)

    try {
      applyBrokCodeFileOperations({
        files,
        operations: [
          {
            type: 'rename_file',
            fromPath: 'src/App.tsx',
            toPath: 'styles.css'
          }
        ]
      })
    } catch (error) {
      expect(error).toBeInstanceOf(BrokCodeFileOperationError)
      expect((error as BrokCodeFileOperationError).code).toBe('conflict')
      expect((error as BrokCodeFileOperationError).conflicts[0]).toMatchObject({
        path: 'styles.css',
        expectedChecksum: null,
        message:
          'Cannot rename src/App.tsx to styles.css because the target file already exists.'
      })
    }
  })

  it('reports expected missing-file deletes as conflicts', () => {
    expect(() =>
      applyBrokCodeFileOperations({
        files,
        operations: [
          {
            type: 'delete_file',
            path: 'missing.ts',
            expectedChecksum: 'previous-checksum'
          }
        ]
      })
    ).toThrow(BrokCodeFileOperationError)

    try {
      applyBrokCodeFileOperations({
        files,
        operations: [
          {
            type: 'delete_file',
            path: 'missing.ts',
            expectedChecksum: 'previous-checksum'
          }
        ]
      })
    } catch (error) {
      expect(error).toBeInstanceOf(BrokCodeFileOperationError)
      expect((error as BrokCodeFileOperationError).code).toBe('conflict')
      expect((error as BrokCodeFileOperationError).conflicts[0]).toMatchObject({
        path: 'missing.ts',
        expectedChecksum: 'previous-checksum',
        actualChecksum: null
      })
    }
  })

  it('can apply anyway for conflict resolution and returns rollback data', () => {
    const result = applyBrokCodeFileOperations({
      files,
      applyAnyway: true,
      operations: [
        {
          type: 'replace_file',
          path: 'styles.css',
          expectedChecksum: 'stale',
          content: 'body { color: blue; }'
        }
      ]
    })

    expect(
      result.files.find(file => file.path === 'styles.css')?.content
    ).toContain('blue')
    expect(result.changes[0].beforeChecksum).toBe(
      checksumBrokCodeFileContent('body { color: black; }')
    )
  })

  it('summarizes full-file generation changes with before and after checksums', () => {
    const changes = summarizeBrokCodeFullFileChanges({
      beforeFiles: files,
      afterFiles: [
        {
          path: 'src/App.tsx',
          language: 'tsx',
          content: 'export default function App() { return <main>New</main> }'
        },
        files[1],
        {
          path: 'README.md',
          language: 'markdown',
          content: '# Student Planner'
        }
      ]
    })

    expect(changes).toHaveLength(2)
    expect(changes[0]).toMatchObject({
      type: 'create_file',
      path: 'README.md',
      beforeChecksum: null,
      afterChecksum: checksumBrokCodeFileContent('# Student Planner')
    })
    expect(changes[1]).toMatchObject({
      type: 'replace_file',
      path: 'src/App.tsx',
      beforeChecksum: checksumBrokCodeFileContent(files[0].content)
    })
  })
})
