'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

import {
  ArrowRight,
  CheckCircle2,
  Code2,
  Download,
  Github,
  KeyRound,
  Link2,
  Monitor,
  PlugZap,
  Rocket,
  TerminalSquare
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

const installSteps = [
  'git clone <your Brok repo URL> brok',
  'cd brok',
  'npm install',
  'open Brok Code Cloud or /api-keys/new and create a Brok API key',
  'export BROK_API_KEY="brok_sk_..."',
  'export BROK_BASE_URL="https://your-brok-domain.com/api/v1"',
  'export BROK_SYNC_URL="https://your-brok-domain.com"',
  'export BROKCODE_SESSION_ID="default"',
  'npm run brokcode'
]

const localDevSteps = [
  'npm run dev -- --hostname 127.0.0.1 --port 3001',
  'create a real Brok API key from http://127.0.0.1:3001/api-keys/new',
  'export BROK_API_KEY="brok_sk_..."',
  'export BROK_BASE_URL="http://127.0.0.1:3001/api/v1"',
  'export BROK_SYNC_URL="http://127.0.0.1:3001"',
  'export BROKCODE_SESSION_ID="default"',
  'npm run brokcode'
]

const coreCommands = [
  '/help',
  '/usage month',
  '/sync',
  '/session',
  '/ai-default',
  '/worktree feature/my-branch',
  '/securityscan',
  '/securityscan process',
  '/github',
  '/skills',
  '/compat'
]

const envVars = [
  ['BROK_API_KEY', 'Required. Only brok_sk_ keys are accepted.'],
  ['BROK_BASE_URL', 'Brok API endpoint, ending in /api/v1 or /v1.'],
  ['BROK_SYNC_URL', 'Web app origin used for Cloud/TUI session sync.'],
  ['BROKCODE_SESSION_ID', 'Shared session name shown in Cloud and TUI.'],
  ['BROK_MODEL', 'Optional model override. Defaults to brok-code.']
]

const compatibilitySteps = [
  'export OPENAI_API_KEY="$BROK_API_KEY"',
  'export OPENAI_BASE_URL="$BROK_BASE_URL"',
  'export OPENAI_MODEL="brok-code"',
  'export ANTHROPIC_API_KEY="$BROK_API_KEY"',
  'export ANTHROPIC_BASE_URL="${BROK_BASE_URL%/v1}"',
  'export ANTHROPIC_MODEL="brok-code"'
]

const workflowCards = [
  {
    title: 'Cloud + Terminal Sync',
    body: 'Use the same BROKCODE_SESSION_ID in Brok Code Cloud and terminal. /sync pulls the shared log from /api/brokcode/sessions.'
  },
  {
    title: 'Worktrees',
    body: '/worktree feature/name creates an isolated git worktree under .brokcode-worktrees for branch work.'
  },
  {
    title: 'Security scans',
    body: '/securityscan initializes DeepSec when needed and runs the real matcher scan. Add process, revalidate, or export for deeper DeepSec phases.'
  },
  {
    title: 'GitHub PRs',
    body: 'Connect GitHub through Composio in Brok Code Cloud, set repository/base/head, then use Open PR after checks pass.'
  },
  {
    title: 'One-click deploy',
    body: 'Use the Brok Code Cloud 1-Click Deploy button when BROKCODE_DEPLOY_WEBHOOK_URL or RAILWAY_API_TOKEN is configured.'
  },
  {
    title: 'Composio prompts',
    body: 'In Brok Code Cloud, prompts like connect GitHub, connect Railway, or connect Linear open the matching Composio flow when configured.'
  }
]

const cloudActions = [
  {
    icon: Github,
    title: 'GitHub PR + repo context',
    body: 'Use Connect GitHub, let Brok Code detect repository context, or enter owner/repo, base, and head before opening a PR.'
  },
  {
    icon: PlugZap,
    title: 'Composio connections',
    body: 'Ask to connect GitHub, Supabase, Gmail, Google Calendar, Linear, Slack, Notion, Vercel, or Railway from the cloud chat.'
  },
  {
    icon: Rocket,
    title: '1-Click Deploy',
    body: 'Deploy only reports success when the configured webhook or Railway API path confirms the trigger.'
  }
]

export default function BrokCodeTuiPage() {
  const router = useRouter()

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col bg-background pt-12">
      <header className="border-b px-4 py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold sm:text-xl">
              Brok Code Terminal TUI
            </h1>
            <p className="text-sm text-muted-foreground">
              Download, configure, and run the terminal version of Brok Code.
            </p>
          </div>
          <Tabs
            value="tui"
            onValueChange={value => {
              if (value === 'cloud') {
                router.push('/brokcode')
              }
            }}
          >
            <TabsList className="h-8 rounded-md">
              <TabsTrigger value="cloud" className="rounded-sm text-xs">
                Cloud
              </TabsTrigger>
              <TabsTrigger value="tui" className="rounded-sm text-xs">
                TUI
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto grid w-full max-w-6xl gap-4">
          <section className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
            <Card className="rounded-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Download className="size-4" />
                  Download + Run
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm leading-6 text-muted-foreground">
                  The TUI ships with this repo as{' '}
                  <code>scripts/brokcode-tui.mjs</code>. Clone the repo and run
                  it with <code>npm run brokcode</code>; no standalone binary is
                  claimed here.
                </p>
                <ol className="space-y-2 text-sm">
                  {installSteps.map((step, index) => (
                    <li
                      key={step}
                      className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-2 rounded-md border bg-muted/20 p-2"
                    >
                      <span className="flex size-6 items-center justify-center rounded-md bg-background text-xs font-medium">
                        {index + 1}
                      </span>
                      <code className="break-words">{step}</code>
                    </li>
                  ))}
                </ol>
                <p className="text-xs leading-5 text-muted-foreground">
                  The TUI runs the real script at{' '}
                  <code>scripts/brokcode-tui.mjs</code>. It sends chat to{' '}
                  <code>/api/brokcode/execute</code>, writes sync events to{' '}
                  <code>/api/brokcode/sessions</code>, and refuses non-Brok API
                  keys.
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <KeyRound className="size-4" />
                  Required Environment
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {envVars.map(([name, detail]) => (
                  <div
                    key={name}
                    className="rounded-md border bg-muted/20 px-3 py-2 text-sm"
                  >
                    <code>{name}</code>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {detail}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <Card className="rounded-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Monitor className="size-4" />
                  Local Development
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <ol className="space-y-2 text-sm">
                  {localDevSteps.map(step => (
                    <li
                      key={step}
                      className="rounded-md border bg-muted/20 p-2"
                    >
                      <code className="break-words">{step}</code>
                    </li>
                  ))}
                </ol>
                <p className="text-xs leading-5 text-muted-foreground">
                  Local smoke keys are not accepted. Use a real key from the API
                  key page so cloud and TUI behavior matches production.
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TerminalSquare className="size-4" />
                  Commands
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-2">
                {coreCommands.map(command => (
                  <div
                    key={command}
                    className="rounded-md border bg-muted/20 px-3 py-2 text-sm"
                  >
                    <code>{command}</code>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <Card className="rounded-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Code2 className="size-4" />
                  Agent Tool Compatibility
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {compatibilitySteps.map(step => (
                  <div key={step} className="rounded-md border bg-muted/20 p-2">
                    <code className="break-words">{step}</code>
                  </div>
                ))}
                <p className="text-xs leading-5 text-muted-foreground">
                  Use this when a Claude Code, Codex, or OpenAI-compatible tool
                  needs to talk through the Brok API layer.
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CheckCircle2 className="size-4" />
                  Daily Workflow
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                {workflowCards.map(card => (
                  <div
                    key={card.title}
                    className="rounded-md border bg-muted/20 p-3"
                  >
                    <div className="text-sm font-medium">{card.title}</div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {card.body}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4">
            <Card className="rounded-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Link2 className="size-4" />
                  Cloud Pairing
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="leading-6 text-muted-foreground">
                  Open Brok Code Cloud, save the same key, set the same session
                  id, then use the Cloud/TUI Sync panel to see terminal events
                  and web runs in one place.
                </p>
                <Button asChild size="sm" className="gap-2">
                  <Link href="/brokcode">
                    Open Brok Code Cloud
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>

            <Card className="rounded-md">
              <CardHeader>
                <CardTitle className="text-base">Cloud Actions</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                {cloudActions.map(action => {
                  const Icon = action.icon
                  return (
                    <div
                      key={action.title}
                      className="rounded-md border bg-muted/20 p-3"
                    >
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Icon className="size-4" />
                        {action.title}
                      </div>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {action.body}
                      </p>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <Card className="rounded-md">
              <CardHeader>
                <CardTitle className="text-base">Troubleshooting</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 text-sm">
                <div className="rounded-md border bg-muted/20 p-3">
                  <div className="font-medium">401 or 403</div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    The key is missing, inactive, or not a real Brok key.
                  </p>
                </div>
                <div className="rounded-md border bg-muted/20 p-3">
                  <div className="font-medium">Sync empty</div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Confirm BROK_SYNC_URL points at the web app and both
                    surfaces use the same BROKCODE_SESSION_ID.
                  </p>
                </div>
                <div className="rounded-md border bg-muted/20 p-3">
                  <div className="font-medium">No streaming</div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Confirm BROK_BASE_URL reaches an API that supports{' '}
                    <code>stream: true</code> chat completions.
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>
        </div>
      </main>

      <footer className="border-t px-4 py-3">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-2">
          <Button asChild size="sm" className="gap-2">
            <Link href="/brokcode">
              Open Brok Code Cloud
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <p className="text-xs text-muted-foreground">
            Cloud preview lives on `/brokcode`; terminal setup and download
            instructions live here.
          </p>
        </div>
      </footer>
    </div>
  )
}
