import { describe, expect, it } from 'vitest'

import { buildBrokCodeRunDiff } from '@/lib/brokcode/diff-summary'

describe('buildBrokCodeRunDiff', () => {
  it('summarizes created, modified, and deleted files', () => {
    const diff = buildBrokCodeRunDiff({
      id: 'diff-1',
      command: 'update app',
      beforeFiles: [
        { path: 'src/App.tsx', content: 'hello\nworld', language: 'tsx' },
        { path: 'old.txt', content: 'remove me', language: 'txt' }
      ],
      afterFiles: [
        {
          path: 'src/App.tsx',
          content: 'hello\nstudent\nworld',
          language: 'tsx'
        },
        { path: 'new.css', content: '.app { color: blue }', language: 'css' }
      ],
      jobId: 'task-1',
      versionId: 'ver-1',
      runtimeChanges: ['Runtime rebuilt'],
      deployChanges: ['Preview updated']
    })

    expect(diff.summary).toBe('1 created, 1 modified, 1 deleted')
    expect(diff.totalFilesChanged).toBe(3)
    expect(diff.files.map(file => [file.path, file.status])).toEqual([
      ['new.css', 'created'],
      ['old.txt', 'deleted'],
      ['src/App.tsx', 'modified']
    ])
    expect(diff.files.find(file => file.path === 'src/App.tsx')).toMatchObject({
      additions: 1,
      deletions: 0,
      language: 'tsx'
    })
    expect(diff.jobId).toBe('task-1')
    expect(diff.versionId).toBe('ver-1')
  })

  it('returns no file changes when contents match', () => {
    const diff = buildBrokCodeRunDiff({
      id: 'diff-2',
      command: 'noop',
      beforeFiles: [{ path: 'index.html', content: '<main />' }],
      afterFiles: [{ path: 'index.html', content: '<main />' }]
    })

    expect(diff.summary).toBe('No file changes')
    expect(diff.files).toEqual([])
    expect(diff.totalFilesChanged).toBe(0)
  })
})
