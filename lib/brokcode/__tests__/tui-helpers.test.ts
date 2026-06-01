import { describe, expect, it } from 'vitest'

import {
  BROK_KEY_PREFIX,
  buildReadlineCompleter,
  chunkSseBlocks,
  classifyHttpError,
  extractCommandName,
  formatBytes,
  formatPhaseLabel,
  isValidBrokKey,
  normalizeBrokKey,
  parseSseBlock,
  parseSseEvent,
  relativeTime,
  spinnerFrame,
  suggestCommands,
  truncateText
} from '../tui-helpers.mjs'

describe('Brok key validation', () => {
  it('accepts keys that start with the Brok prefix', () => {
    expect(isValidBrokKey(`${BROK_KEY_PREFIX}abc123`)).toBe(true)
  })

  it('rejects empty, wrong-prefix, and non-string values', () => {
    expect(isValidBrokKey('')).toBe(false)
    expect(isValidBrokKey('sk-abc')).toBe(false)
    expect(isValidBrokKey(undefined)).toBe(false)
    expect(isValidBrokKey(null)).toBe(false)
    expect(isValidBrokKey(42)).toBe(false)
  })

  it('trims and normalizes a valid key', () => {
    expect(normalizeBrokKey(`  ${BROK_KEY_PREFIX}xyz  `)).toBe(
      `${BROK_KEY_PREFIX}xyz`
    )
  })

  it('returns null for invalid keys', () => {
    expect(normalizeBrokKey('nope')).toBeNull()
    expect(normalizeBrokKey(null)).toBeNull()
  })
})

describe('classifyHttpError', () => {
  it('classifies 401 as auth error with helpful message', () => {
    const result = classifyHttpError({ status: 401, body: null })
    expect(result.status).toBe(401)
    expect(result.isAuthError).toBe(true)
    expect(result.message).toMatch(/key/i)
    expect(result.hint).toBeNull()
  })

  it('classifies 429 as rate limited', () => {
    const result = classifyHttpError({ status: 429, body: null })
    expect(result.isRateLimited).toBe(true)
    expect(result.message).toMatch(/rate/i)
  })

  it('classifies 5xx as server error', () => {
    const result = classifyHttpError({ status: 502, body: null })
    expect(result.isServerError).toBe(true)
    expect(result.message).toMatch(/provider|retry/i)
  })

  it('prefers server-provided message and keeps hint available', () => {
    const result = classifyHttpError({
      status: 403,
      body: { error: 'forbidden scope' }
    })
    expect(result.message).toBe('forbidden scope')
    expect(result.hint).toMatch(/scope|authorized/i)
  })

  it('falls back when no body and no hint exists', () => {
    const result = classifyHttpError({
      status: 418,
      body: null,
      fallback: 'tea time'
    })
    expect(result.message).toBe('tea time')
    expect(result.hint).toBeNull()
  })

  it('extracts nested error.message', () => {
    const result = classifyHttpError({
      status: 400,
      body: { error: { message: 'bad', code: 'bad_input' } }
    })
    expect(result.message).toBe('bad')
    expect(result.code).toBe('bad_input')
  })
})

describe('SSE parsing', () => {
  it('parses an event line', () => {
    expect(parseSseEvent('event: status')).toEqual({
      kind: 'event',
      value: 'status'
    })
  })

  it('parses a data line', () => {
    expect(parseSseEvent('data: {"x":1}')).toEqual({
      kind: 'data',
      value: '{"x":1}'
    })
  })

  it('treats empty line as boundary', () => {
    expect(parseSseEvent('')).toEqual({ kind: 'boundary' })
    expect(parseSseEvent('garbage')).toBeNull()
  })

  it('parses a full block into event + JSON data', () => {
    const block = 'event: delta\ndata: {"content":"hi"}'
    expect(parseSseBlock(block)).toEqual({
      event: 'delta',
      data: { content: 'hi' },
      done: false
    })
  })

  it('returns null when block has no data', () => {
    expect(parseSseBlock('event: ping')).toBeNull()
  })

  it('returns done for the [DONE] sentinel', () => {
    expect(parseSseBlock('data: [DONE]')).toEqual({
      event: 'message',
      data: null,
      done: true
    })
  })

  it('chunks a buffer into complete blocks', () => {
    const buffer = 'event: a\ndata: {"x":1}\n\nevent: b\ndata: {"y":2}\n\n'
    const { blocks, remaining } = chunkSseBlocks(buffer)
    expect(blocks).toHaveLength(2)
    expect(blocks[0].data).toEqual({ x: 1 })
    expect(blocks[1].data).toEqual({ y: 2 })
    expect(remaining).toBe('')
  })

  it('preserves incomplete trailing buffer', () => {
    const buffer = 'event: a\ndata: {"x":1}\n\nevent: b\ndata: {"y"'
    const { blocks, remaining } = chunkSseBlocks(buffer)
    expect(blocks).toHaveLength(1)
    expect(remaining).toBe('event: b\ndata: {"y"')
  })
})

describe('command extraction', () => {
  it('extracts simple slash commands', () => {
    expect(extractCommandName('/help')).toBe('help')
    expect(extractCommandName('/file put foo bar')).toBe('file')
  })

  it('lowercases command names', () => {
    expect(extractCommandName('/HELP')).toBe('help')
  })

  it('returns null for non-slash input', () => {
    expect(extractCommandName('hello')).toBeNull()
    expect(extractCommandName('')).toBeNull()
    expect(extractCommandName(null)).toBeNull()
  })
})

describe('formatting helpers', () => {
  it('formats byte sizes', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(5_242_880)).toBe('5.00 MB')
    expect(formatBytes(-1)).toBe('0 B')
    expect(formatBytes(NaN)).toBe('0 B')
  })

  it('formats phase labels with spaces', () => {
    expect(formatPhaseLabel('writing_files')).toBe('writing files')
    expect(formatPhaseLabel(null)).toBe('running')
  })

  it('truncates long text with an ellipsis', () => {
    expect(truncateText('short')).toBe('short')
    expect(truncateText('a'.repeat(300), 10)).toMatch(/…$/)
  })

  it('returns a deterministic spinner frame', () => {
    expect(spinnerFrame(0)).toBe('⠋')
    expect(spinnerFrame(1)).toBe('⠙')
    expect(spinnerFrame(100)).toBe(spinnerFrame(0))
  })

  it('formats relative time for recent and old timestamps', () => {
    const now = Date.now()
    expect(relativeTime(new Date(now - 2_000).toISOString())).toBe('just now')
    expect(relativeTime(new Date(now - 30_000).toISOString())).toMatch(/s ago$/)
    expect(relativeTime(new Date(now - 5 * 60_000).toISOString())).toMatch(
      /m ago$/
    )
    expect(relativeTime(new Date(now - 2 * 3600_000).toISOString())).toMatch(
      /h ago$/
    )
    expect(relativeTime('not-a-date')).toBe('')
  })
})

describe('command suggestions', () => {
  it('returns nothing for non-slash input', () => {
    expect(suggestCommands('hi')).toEqual([])
  })

  it('returns commands that share a prefix', () => {
    const suggestions = suggestCommands('/ver')
    expect(suggestions).toContain('/version')
    expect(suggestions).toContain('/versions')
    expect(suggestions.every(s => s.startsWith('/ver'))).toBe(true)
  })

  it('returns nothing if no commands match', () => {
    expect(suggestCommands('/zzz')).toEqual([])
  })
})

describe('readline completer', () => {
  it('returns matches for the first token', () => {
    const completer = buildReadlineCompleter()
    const [matches, line] = completer('/ve')
    expect(matches).toContain('/version')
    expect(matches).toContain('/versions')
    expect(line).toBe('/ve')
  })

  it('offers project subcommands', () => {
    const completer = buildReadlineCompleter()
    const [matches] = completer('/project ')
    expect(matches).toContain('new')
    expect(matches).toContain('select')
    expect(matches).toContain('rename')
    expect(matches).toContain('delete')
  })

  it('offers backend subcommands', () => {
    const completer = buildReadlineCompleter()
    const [matches] = completer('/backend ')
    expect(matches).toContain('insforge')
    expect(matches).toContain('provision')
  })

  it('offers file subcommands', () => {
    const completer = buildReadlineCompleter()
    const [matches] = completer('/file ')
    expect(matches).toContain('put')
    expect(matches).toContain('show')
    expect(matches).toContain('delete')
    expect(matches).toContain('rename')
  })

  it('falls back to extra suggestions when given', () => {
    const completer = buildReadlineCompleter(['proj-alpha', 'proj-beta'])
    const [matches] = completer('/project select pro')
    expect(matches).toContain('proj-alpha')
    expect(matches).toContain('proj-beta')
  })

  it('returns no matches for plain text', () => {
    const completer = buildReadlineCompleter()
    const [matches, line] = completer('hello')
    expect(matches).toEqual([])
    expect(line).toBe('hello')
  })
})
