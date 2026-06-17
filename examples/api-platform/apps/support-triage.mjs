#!/usr/bin/env node

import { readFile } from 'node:fs/promises'

import { chatCompletion, listModels, printJson } from './lib/brok-client.mjs'

const ticketPath = process.argv[2]
if (!ticketPath) {
  throw new Error(
    'Usage: node examples/api-platform/apps/support-triage.mjs examples/api-platform/apps/sample-support-ticket.json'
  )
}

const ticket = JSON.parse(await readFile(ticketPath, 'utf8'))
const models = await listModels()
const triage = await chatCompletion({
  model: 'brok-code',
  messages: [
    {
      role: 'system',
      content:
        'You are an API support triage assistant. Return valid JSON only with keys: severity, category, likely_cause, customer_reply, internal_next_steps.'
    },
    {
      role: 'user',
      content: JSON.stringify(ticket, null, 2)
    }
  ],
  maxTokens: 600,
  temperature: 0
})

printJson({
  app: 'support-triage',
  modelCount: models.length,
  requestId: triage.requestId,
  ticketSubject: ticket.subject,
  triage: triage.content
})
