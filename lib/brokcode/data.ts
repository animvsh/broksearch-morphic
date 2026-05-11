export type SubagentStatus = 'running' | 'blocked' | 'review' | 'done'

export type SubagentEvent = {
  time: string
  label: string
  detail: string
}

export type BrokCodeSubagent = {
  id: string
  name: string
  role: string
  status: SubagentStatus
  accent: 'cyan' | 'emerald' | 'amber' | 'rose' | 'violet' | 'blue'
  progress: number
  currentTask: string
  branch: string
  files: string[]
  tools: string[]
  events: SubagentEvent[]
  nextStep: string
}

export const brokCodeSubagents: BrokCodeSubagent[] = []

export const brokCodeCommands = [
  '/securityscan',
  'Build an AI app using Brok API as the model layer',
  'Build the feature and show every subagent',
  'Audit the repo in parallel',
  'Have one agent fix UI and one agent write tests',
  'Open a PR after checks pass'
]
