import Link from 'next/link'

export default function IntegrationsDocsPage() {
  return (
    <div className="container max-w-3xl py-8">
      <h1 className="mb-4 text-4xl font-bold">Integrations</h1>
      <p className="mb-8 text-xl text-muted-foreground">
        Brok uses Composio connection popups for external tools and keeps status
        visible in product surfaces.
      </p>

      <div className="prose prose-neutral dark:prose-invert">
        <h2>Supported toolkits</h2>
        <ul>
          <li>Gmail and Google Calendar for BrokMail.</li>
          <li>GitHub for BrokCode repository context and pull requests.</li>
          <li>Linear for task context.</li>
          <li>
            Google Docs, Google Slides, and Google Meet for workspace actions.
          </li>
        </ul>

        <h2>Connection behavior</h2>
        <p>
          Product prompts open a popup through
          <code className="mx-1">/api/integrations/[toolkit]/connect</code>. The
          app polls
          <code className="mx-1">/api/integrations/[toolkit]/status</code>
          after the popup closes and shows errors instead of pretending the
          connection exists.
        </p>

        <h2>Environment</h2>
        <p>
          Set <code>COMPOSIO_API_KEY</code> and toolkit auth config IDs for
          managed OAuth flows. Auth config IDs stay server-side.
        </p>

        <p>
          Open <Link href="/integrations">Integrations</Link> to connect or
          inspect account status.
        </p>
      </div>
    </div>
  )
}
