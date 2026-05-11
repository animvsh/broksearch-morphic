export type MailboxView =
  | 'inbox'
  | 'needs-reply'
  | 'follow-ups'
  | 'drafts'
  | 'sent'
  | 'newsletters'
  | 'receipts'
  | 'calendar'
  | 'automations'

export type EmailMessage = {
  id: string
  from: string
  to: string[]
  sentAt: string
  body: string
}

export type MailThread = {
  id: string
  providerThreadId?: string
  providerMessageIds?: string[]
  sender: string
  senderEmail: string
  subject: string
  snippet: string
  aiSummary: string
  receivedAt: string
  labels: string[]
  unread: boolean
  starred: boolean
  important: boolean
  hasAttachments: boolean
  needsReply: boolean
  waitingOnReply: boolean
  category: 'primary' | 'sales' | 'school' | 'receipt' | 'newsletter'
  messages: EmailMessage[]
  actionItems: string[]
  openQuestions: string[]
}

export type AutomationRule = {
  id: string
  name: string
  trigger: string
  condition: string
  action: string
  approval: string
  enabled: boolean
  lastRun: string
}

export const brokMailTonePreference =
  'Friendly, concise, direct. Avoid stiff openers. Sign as Animesh.'
