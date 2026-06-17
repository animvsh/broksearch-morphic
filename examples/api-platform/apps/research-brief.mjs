#!/usr/bin/env node

import {
  chatCompletion,
  listModels,
  printJson,
  searchCompletion
} from './lib/brok-client.mjs'

const query =
  process.argv.slice(2).join(' ').trim() ||
  'What should developers verify before shipping an API integration?'

const models = await listModels()
const search = await searchCompletion({
  query,
  searchDepth: 'basic'
})

const synthesis = await chatCompletion({
  model: 'brok-code',
  messages: [
    {
      role: 'system',
      content:
        'You turn research notes into concise developer briefs. Use bullets and include risks.'
    },
    {
      role: 'user',
      content: `Question: ${query}\n\nResearch notes:\n${search.content}\n\nWrite a compact brief with: summary, 3 findings, risks, and next action.`
    }
  ],
  maxTokens: 650
})

printJson({
  app: 'research-brief',
  query,
  modelCount: models.length,
  searchRequestId: search.requestId,
  synthesisRequestId: synthesis.requestId,
  citationCount: search.citations.length,
  brief: synthesis.content
})
