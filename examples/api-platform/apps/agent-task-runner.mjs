#!/usr/bin/env node

import { readFile } from 'node:fs/promises'

import { chatCompletion, listModels, printJson } from './lib/brok-client.mjs'

const args = process.argv.slice(2)
const fileIndex = args.indexOf('--file')
const task =
  fileIndex === -1
    ? args.join(' ').trim()
    : await readFile(args[fileIndex + 1], 'utf8')

if (!task) {
  throw new Error(
    'Usage: node examples/api-platform/apps/agent-task-runner.mjs "Draft a release checklist"'
  )
}

const models = await listModels()
let result = await runAgentTask(task)

if (!result.content.trim()) {
  result = await runAgentTask(compactTask(task))
}

if (!result.content.trim()) {
  throw new Error('Brok returned an empty agent task response.')
}

printJson({
  app: 'agent-task-runner',
  modelCount: models.length,
  requestId: result.requestId,
  task,
  result: result.content
})

function runAgentTask(content) {
  return chatCompletion({
    model: 'brok-code',
    messages: [
      {
        role: 'system',
        content:
          'You are a careful coding-agent helper. Produce concise, actionable output. If the task asks for a plan, include verification steps.'
      },
      {
        role: 'user',
        content
      }
    ],
    maxTokens: 700
  })
}

function compactTask(content) {
  const text = content.trim()
  if (text.length <= 4000) {
    return `${text}\n\nReturn a concise numbered plan with concrete verification commands.`
  }

  return [
    text.slice(0, 2200),
    '\n\n[context trimmed]\n\n',
    text.slice(-1400),
    '\n\nReturn a concise numbered plan with concrete verification commands.'
  ].join('')
}
