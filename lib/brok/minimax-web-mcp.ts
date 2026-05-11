import { spawn } from 'node:child_process'

import { MINIMAX_API_KEY, MINIMAX_BASE_URL } from '@/lib/ai/minimax'

export interface MiniMaxMcpOrganicResult {
  title?: string
  link?: string
  snippet?: string
  date?: string
}

interface JsonRpcMessage {
  id?: number
  result?: {
    content?: Array<{ type: string; text?: string }>
    structuredContent?: { text?: string }
  }
  error?: { message?: string }
}

const MCP_TIMEOUT_MS = 20_000

function resolveMcpHost(): string {
  return (process.env.MINIMAX_API_HOST || MINIMAX_BASE_URL).replace(
    /\/v1\/?$/,
    ''
  )
}

function parseSearchPayload(
  message: JsonRpcMessage
): MiniMaxMcpOrganicResult[] {
  const rawText =
    message.result?.structuredContent?.text ??
    message.result?.content?.find(item => item.type === 'text')?.text

  if (!rawText) {
    return []
  }

  const parsed = JSON.parse(rawText)
  const organic = Array.isArray(parsed?.organic) ? parsed.organic : []

  return organic
    .filter((item: unknown): item is Record<string, unknown> => {
      return Boolean(item && typeof item === 'object')
    })
    .map((item: Record<string, unknown>) => ({
      title: typeof item.title === 'string' ? item.title : undefined,
      link: typeof item.link === 'string' ? item.link : undefined,
      snippet: typeof item.snippet === 'string' ? item.snippet : undefined,
      date: typeof item.date === 'string' ? item.date : undefined
    }))
}

export async function searchWithMiniMaxMcp(
  query: string
): Promise<MiniMaxMcpOrganicResult[]> {
  if (!MINIMAX_API_KEY) {
    throw new Error('Brok provider API key not configured')
  }

  return new Promise((resolve, reject) => {
    const command = process.env.MINIMAX_MCP_COMMAND || 'uvx'
    const args = process.env.MINIMAX_MCP_ARGS?.trim()
      ? process.env.MINIMAX_MCP_ARGS.trim().split(/\s+/)
      : ['minimax-coding-plan-mcp']

    const child = spawn(command, args, {
      env: {
        ...process.env,
        MINIMAX_API_HOST: resolveMcpHost(),
        MINIMAX_API_KEY
      },
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let stdoutBuffer = ''
    let stderrBuffer = ''
    let settled = false

    const cleanup = () => {
      child.kill()
      clearTimeout(timeout)
    }

    const finish = (
      callback: () => void,
      rejectCallback?: (error: Error) => void
    ) => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      if (rejectCallback) {
        rejectCallback(new Error(stderrBuffer || 'MiniMax MCP search failed'))
      } else {
        callback()
      }
    }

    const send = (message: Record<string, unknown>) => {
      child.stdin.write(`${JSON.stringify(message)}\n`)
    }

    const timeout = setTimeout(() => {
      finish(() => undefined, reject)
    }, MCP_TIMEOUT_MS)

    child.on('error', error => {
      finish(
        () => undefined,
        () => reject(error)
      )
    })

    child.stderr.on('data', chunk => {
      stderrBuffer += chunk.toString()
    })

    child.stdout.on('data', chunk => {
      stdoutBuffer += chunk.toString()
      const lines = stdoutBuffer.split('\n')
      stdoutBuffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.trim()) {
          continue
        }

        let message: JsonRpcMessage
        try {
          message = JSON.parse(line)
        } catch {
          continue
        }

        if (message.id !== 2) {
          continue
        }

        if (message.error) {
          finish(
            () => undefined,
            () =>
              reject(new Error(message.error?.message || 'MiniMax MCP error'))
          )
          return
        }

        try {
          const results = parseSearchPayload(message)
          finish(() => resolve(results))
        } catch (error) {
          finish(
            () => undefined,
            () =>
              reject(error instanceof Error ? error : new Error(String(error)))
          )
        }
      }
    })

    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'brok-search', version: '1.0.0' }
      }
    })

    setTimeout(() => {
      send({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
        params: {}
      })
      send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'web_search',
          arguments: { query }
        }
      })
    }, 100)
  })
}
