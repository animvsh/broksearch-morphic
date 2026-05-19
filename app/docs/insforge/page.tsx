import Link from 'next/link'

export default function InsForgeDocsPage() {
  return (
    <div className="container max-w-3xl py-8">
      <h1 className="mb-4 text-4xl font-bold">InsForge backend provider</h1>
      <p className="mb-8 text-xl text-muted-foreground">
        BrokCode can attach generated apps to a Brok-managed shared InsForge
        backend hosted on Railway.
      </p>

      <div className="prose prose-neutral dark:prose-invert">
        <h2>Shared Railway mode</h2>
        <p>
          Set the shared provider once on the Brok deployment. Browser builders
          receive only public project URL and app key metadata; the admin key
          remains server-side and encrypted in project metadata.
        </p>

        <pre className="rounded-lg bg-muted p-4">
          <code>{`BROKCODE_INSFORGE_SHARED_URL=https://your-insforge-service.up.railway.app
BROKCODE_INSFORGE_SHARED_ADMIN_KEY=...
BROKCODE_INSFORGE_SHARED_APP_KEY=...
BROKCODE_INSFORGE_SHARED_DASHBOARD_URL=https://...
BROKCODE_INSFORGE_SHARED_PROJECT_ID=...
BROKCODE_INSFORGE_SHARED_REGION=us`}</code>
        </pre>

        <h2>Runtime context</h2>
        <p>
          BrokCode passes InsForge health, database metadata, storage metadata,
          function metadata, and public client env names into the coding-agent
          prompt. Generated source must use public env names such as
          <code className="mx-1">VITE_INSFORGE_URL</code> and never include the
          admin key.
        </p>

        <h2>Health and provisioning</h2>
        <ul>
          <li>
            <code>POST /api/brokcode/projects/insforge/provision</code> attaches
            the shared backend when shared Railway env vars are configured.
          </li>
          <li>
            <code>POST /api/brokcode/projects/[id]/backend/health</code> checks
            the live InsForge service and stores the last result.
          </li>
        </ul>

        <p>
          Continue with <Link href="/docs/brokcode">BrokCode</Link> or the{' '}
          <Link href="/docs/brokcode-api">BrokCode API</Link>.
        </p>
      </div>
    </div>
  )
}
