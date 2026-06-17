#!/usr/bin/env node

import { chatCompletion, listModels, printJson } from './lib/brok-client.mjs'

const task = process.argv.slice(2).join(' ').trim()
if (!task) {
  throw new Error(
    'Usage: node examples/api-platform/apps/agent-task-runner.mjs "Draft a release checklist"'
  )
}

const models = await listModels()
const result = await chatCompletion({
  model: 'brok-code',
  messages: [
    {
      role: 'system',
      content:
        'You are a careful coding-agent helper. Produce concise, actionable output. If the task asks for a plan, include verification steps.'
    },
    {
      role: 'user',
      content: task
    }
  ],
  maxTokens: 700
})

printJson({
  app: 'agent-task-runner',
  modelCount: models.length,
  requestId: result.requestId,
  task,
  result: result.content
})
