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
const supportTask = [
  'Draft a concise API support triage note for this ticket.',
  'Include Severity, Category, Likely cause, Customer reply, and Internal next steps.',
  '',
  `Subject: ${ticket.subject}`,
  `Plan: ${ticket.plan}`,
  `Message: ${ticket.message}`
].join('\n')
let triage = await runTriage(supportTask)

if (!triage.content.trim()) {
  triage = await runTriage(
    `You are a coding-agent helper. ${supportTask}\n\nReturn a short markdown note.`
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
        content:
          'You are a careful coding-agent helper. Produce concise, actionable output. If the task asks for a plan, include verification steps.'
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
