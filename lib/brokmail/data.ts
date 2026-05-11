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

export const brokMailThreads: MailThread[] = [
  {
    id: 'thread-adithya-contract',
    sender: 'Adithya',
    senderEmail: 'adithya@beevr.ai',
    subject: 'Employment Contract for BrokMail',
    snippet:
      'Attached is the latest contract. Please review the start date and send the signed version when ready.',
    aiSummary: 'Waiting for your signature confirmation and final signed copy.',
    receivedAt: '2:14 PM',
    labels: ['Inbox', 'Contract', 'Important'],
    unread: true,
    starred: true,
    important: true,
    hasAttachments: true,
    needsReply: true,
    waitingOnReply: false,
    category: 'primary',
    actionItems: [
      'Confirm whether the start date works',
      'Ask Adithya to resend the final signed version'
    ],
    openQuestions: ['Is the payment schedule final?'],
    messages: [
      {
        id: 'msg-adithya-1',
        from: 'Adithya',
        to: ['Animesh'],
        sentAt: 'Yesterday, 4:42 PM',
        body: 'Hey Animesh, attaching the latest BrokMail employment contract. The start date is listed as May 20. Let me know if anything needs to change.'
      },
      {
        id: 'msg-adithya-2',
        from: 'Animesh',
        to: ['Adithya'],
        sentAt: 'Yesterday, 5:18 PM',
        body: 'Thanks. Can you confirm when the first payment starts after onboarding?'
      },
      {
        id: 'msg-adithya-3',
        from: 'Adithya',
        to: ['Animesh'],
        sentAt: 'Today, 2:14 PM',
        body: 'First payment starts after onboarding is complete. Please send the signed version when ready and I can countersign it.'
      }
    ]
  },
  {
    id: 'thread-sarah-pricing',
    sender: 'Sarah Chen',
    senderEmail: 'sarah@northstarcrm.com',
    subject: 'Pricing for the sales workflow',
    snippet:
      'We are interested in BrokMail for the sales team. Could you send pricing and pilot details?',
    aiSummary: 'Hot lead asked for pricing and a pilot path.',
    receivedAt: '11:08 AM',
    labels: ['Inbox', 'Customers'],
    unread: true,
    starred: false,
    important: true,
    hasAttachments: false,
    needsReply: true,
    waitingOnReply: false,
    category: 'sales',
    actionItems: ['Send pricing overview', 'Offer a 20 minute pilot call'],
    openQuestions: ['How many sales seats do they need?'],
    messages: [
      {
        id: 'msg-sarah-1',
        from: 'Sarah Chen',
        to: ['Animesh'],
        sentAt: 'Today, 11:08 AM',
        body: 'Hi Animesh, we are interested in BrokMail for our sales team. Could you send pricing and what a pilot would look like?'
      }
    ]
  },
  {
    id: 'thread-professor-lee',
    sender: 'Professor Lee',
    senderEmail: 'lee@stanford.edu',
    subject: 'Project topic confirmation',
    snippet:
      'Please confirm the final topic for your project by Friday so I can approve the scope.',
    aiSummary: 'Needs a short confirmation before Friday.',
    receivedAt: '9:32 AM',
    labels: ['Inbox', 'School'],
    unread: false,
    starred: false,
    important: true,
    hasAttachments: false,
    needsReply: true,
    waitingOnReply: false,
    category: 'school',
    actionItems: ['Confirm final project topic by Friday'],
    openQuestions: [],
    messages: [
      {
        id: 'msg-lee-1',
        from: 'Professor Lee',
        to: ['Animesh'],
        sentAt: 'Today, 9:32 AM',
        body: 'Please confirm the final topic for your project by Friday so I can approve the scope.'
      }
    ]
  },
  {
    id: 'thread-stripe-receipt',
    sender: 'Stripe',
    senderEmail: 'receipts@stripe.com',
    subject: 'Receipt from Railway',
    snippet: 'Your receipt for Railway usage is attached.',
    aiSummary: 'Receipt. Safe to label as Expenses.',
    receivedAt: 'Yesterday',
    labels: ['Inbox', 'Receipt'],
    unread: false,
    starred: false,
    important: false,
    hasAttachments: true,
    needsReply: false,
    waitingOnReply: false,
    category: 'receipt',
    actionItems: ['Label as Expenses'],
    openQuestions: [],
    messages: [
      {
        id: 'msg-stripe-1',
        from: 'Stripe',
        to: ['Animesh'],
        sentAt: 'Yesterday, 8:21 PM',
        body: 'Your receipt for Railway usage is attached.'
      }
    ]
  },
  {
    id: 'thread-linear-newsletter',
    sender: 'Linear Digest',
    senderEmail: 'digest@linear.app',
    subject: 'Weekly product updates',
    snippet: 'A quick look at what shipped this week.',
    aiSummary: 'Newsletter. Low priority.',
    receivedAt: 'Tue',
    labels: ['Inbox', 'Newsletter'],
    unread: false,
    starred: false,
    important: false,
    hasAttachments: false,
    needsReply: false,
    waitingOnReply: false,
    category: 'newsletter',
    actionItems: [],
    openQuestions: [],
    messages: [
      {
        id: 'msg-linear-1',
        from: 'Linear Digest',
        to: ['Animesh'],
        sentAt: 'Tuesday, 10:00 AM',
        body: 'A quick look at what shipped this week across the Linear product.'
      }
    ]
  },
  {
    id: 'thread-maya-followup',
    sender: 'Maya Patel',
    senderEmail: 'maya@venturebridge.com',
    subject: 'Re: BrokMail investor update',
    snippet:
      'Thanks for sending this over. I will review and circle back after partner meeting.',
    aiSummary: 'You sent an update 6 days ago. Good follow-up candidate.',
    receivedAt: 'Apr 29',
    labels: ['Sent', 'Investors'],
    unread: false,
    starred: true,
    important: true,
    hasAttachments: false,
    needsReply: false,
    waitingOnReply: true,
    category: 'primary',
    actionItems: ['Follow up with a concise reminder'],
    openQuestions: ['Did the partner meeting happen?'],
    messages: [
      {
        id: 'msg-maya-1',
        from: 'Animesh',
        to: ['Maya Patel'],
        sentAt: 'Apr 29, 1:16 PM',
        body: 'Sharing the BrokMail update we discussed. Happy to send over the beta notes if useful.'
      },
      {
        id: 'msg-maya-2',
        from: 'Maya Patel',
        to: ['Animesh'],
        sentAt: 'Apr 29, 3:44 PM',
        body: 'Thanks for sending this over. I will review and circle back after our partner meeting.'
      }
    ]
  }
]

export const brokMailAutomations: AutomationRule[] = [
  {
    id: 'auto-receipts',
    name: 'Label receipts',
    trigger: 'New email arrives',
    condition: 'Email looks like a receipt or invoice',
    action: 'Apply Expenses label',
    approval: 'Not required',
    enabled: true,
    lastRun: 'Yesterday'
  },
  {
    id: 'auto-newsletters',
    name: 'Newsletter cleanup',
    trigger: 'Every morning',
    condition: 'Unread newsletter older than 3 days',
    action: 'Archive after preview',
    approval: 'Required',
    enabled: true,
    lastRun: 'Today'
  }
]

export const brokMailTonePreference =
  'Friendly, concise, direct. Avoid stiff openers. Sign as Animesh.'
