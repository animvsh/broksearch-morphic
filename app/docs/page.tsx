export default function DocsPage() {
  return (
    <div className="container max-w-6xl py-8">
      <div className="mb-8 max-w-3xl">
        <h1 className="mb-4 text-4xl font-bold">Brok Documentation</h1>
        <p className="text-xl text-muted-foreground">
          Build with Brok APIs, run Brok Code, connect tools, and operate the
          platform with clear security, usage, billing, and launch-readiness
          guidance.
        </p>
      </div>

      <section className="mb-8 grid gap-4 md:grid-cols-3">
        <PathCard
          title="Start in 5 minutes"
          items={[
            ['Quickstart', '/docs/quickstart'],
            ['API Keys', '/docs/api-keys'],
            ['Models', '/docs/models']
          ]}
        />
        <PathCard
          title="Build on the API"
          items={[
            ['Chat Completions', '/docs/chat-completions'],
            ['Search Completions', '/docs/search-completions'],
            ['Errors', '/docs/errors']
          ]}
        />
        <PathCard
          title="Operate safely"
          items={[
            ['Security', '/docs/security'],
            ['Rate Limits', '/docs/rate-limits'],
            ['Admin, Usage, Billing', '/docs/admin']
          ]}
        />
      </section>

      <section className="mb-8 rounded-lg border bg-muted/20 p-4">
        <h2 className="mb-2 text-lg font-semibold">Launch Readiness</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Before treating Brok as a primary production platform, verify API
          contracts, environment readiness, seeded smoke tests, usage metering,
          and secret handling.
        </p>
        <pre className="overflow-x-auto rounded-md bg-background p-3 text-xs">
          <code>{`bun run check:deploy-env -- --local
SMOKE_BASE_URL=https://www.brok.fyi STRESS_PLATFORM_CONTRACTS_ONLY=true bun run stress:platform
SMOKE_BASE_URL=https://www.brok.fyi SMOKE_SEED_TOKEN=... bun run smoke:platform
SMOKE_BASE_URL=https://www.brok.fyi SMOKE_SEED_TOKEN=... bun run stress:platform`}</code>
        </pre>
      </section>

      <div className="grid gap-6 md:grid-cols-3">
        <DocCard
          title="Quickstart"
          description="Get started with Brok in 5 minutes"
          href="/docs/quickstart"
        />
        <DocCard
          title="API Keys"
          description="Create and manage your Brok API keys"
          href="/docs/api-keys"
        />
        <DocCard
          title="Chat Completions"
          description="Build chat interfaces with Brok"
          href="/docs/chat-completions"
        />
        <DocCard
          title="Brok Code"
          description="Use Brok Code in cloud, terminal, and coding-agent tools"
          href="/docs/brokcode"
        />
        <DocCard
          title="BrokCode API"
          description="Use Brok Code through API-compatible agent endpoints"
          href="/docs/brokcode-api"
        />
        <DocCard
          title="BrokMail"
          description="Connect Gmail and Calendar with approval-gated actions"
          href="/docs/brokmail"
        />
        <DocCard
          title="Integrations"
          description="Connect Composio toolkits and inspect status"
          href="/docs/integrations"
        />
        <DocCard
          title="Admin, Usage, Billing"
          description="Control access, feature gates, budgets, and analytics"
          href="/docs/admin"
        />
        <DocCard
          title="Tools"
          description="Use Humanizer and the platform feature request queue"
          href="/docs/tools"
        />
        <DocCard
          title="InsForge"
          description="Configure the shared Brok-managed backend provider"
          href="/docs/insforge"
        />
        <DocCard
          title="Search Completions"
          description="Add search-powered AI to your app"
          href="/docs/search-completions"
        />
        <DocCard
          title="Models"
          description="Available Brok models and pricing"
          href="/docs/models"
        />
        <DocCard
          title="Rate Limits"
          description="Understanding Brok's rate limits"
          href="/docs/rate-limits"
        />
        <DocCard
          title="Errors"
          description="Error codes and handling strategies"
          href="/docs/errors"
        />
        <DocCard
          title="Security"
          description="API key security best practices"
          href="/docs/security"
        />
      </div>
    </div>
  )
}

function DocCard({
  title,
  description,
  href
}: {
  title: string
  description: string
  href: string
}) {
  return (
    <a
      href={href}
      className="block rounded-lg border p-6 transition-colors hover:border-primary hover:bg-muted/50"
    >
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </a>
  )
}

function PathCard({
  title,
  items
}: {
  title: string
  items: Array<[string, string]>
}) {
  return (
    <div className="rounded-lg border p-4">
      <h2 className="mb-3 text-base font-semibold">{title}</h2>
      <div className="grid gap-2">
        {items.map(([label, href]) => (
          <a
            key={href}
            href={href}
            className="rounded-md border bg-background px-3 py-2 text-sm transition-colors hover:border-primary hover:bg-muted/50"
          >
            {label}
          </a>
        ))}
      </div>
    </div>
  )
}
