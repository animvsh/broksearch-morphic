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
const systemPrompt = [
  'You are a helpful API support engineer.',
  'Triage the issue and write a concise support note.',
  'Include severity, likely cause, customer reply, and internal next steps.'
].join(' ')
let triage = await runTriage(JSON.stringify(ticket, null, 2))

if (!triage.content.trim()) {
  triage = await runTriage(
    `Subject: ${ticket.subject}\nPlan: ${ticket.plan}\nMessage: ${ticket.message}\n\nWrite a concise support triage note.`
  )
}

if (!triage.content.trim()) {
  throw new Error('Brok returned an empty triage response.')
}

printJson({
  app: 'support-triage',
  modelCount: models.length,
  requestId: triage.requestId,
  ticketSubject: ticket.subject,
  triage: triage.content
})

function runTriage(content) {
  return chatCompletion({
    model: 'brok-code',
    messages: [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content
      }
    ],
    maxTokens: 500,
    temperature: 0.2
  })
}
