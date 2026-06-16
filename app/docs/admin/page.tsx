import Link from 'next/link'

export default function AdminDocsPage() {
  return (
    <div className="container max-w-3xl py-8">
      <h1 className="mb-4 text-4xl font-bold">Admin, usage, and billing</h1>
      <p className="mb-8 text-xl text-muted-foreground">
        Admins control account access, feature gates, provider settings, usage
        ledgers, and spend controls from Brok admin surfaces.
      </p>

      <div className="prose prose-neutral dark:prose-invert">
        <h2>Feature gates</h2>
        <p>
          Admins can allow or deny surfaces such as Search, BrokCode, BrokMail,
          API, Tools, and admin access. Product routes call the same access
          guard before rendering.
        </p>

        <h2>Usage</h2>
        <p>
          API and product events write to the Brok usage ledger. Usage pages and
          <code className="mx-1">GET /api/v1/usage</code> aggregate request
          count, input tokens, output tokens, and billed USD by period.
        </p>

        <h2>Billing controls</h2>
        <p>
          Billing uses plan limits and monthly budget configuration to prevent
          unexpected spend. Admins can pause or restrict API keys by scope.
        </p>

        <h2>Routes</h2>
        <ul>
          <li>
            <Link
              href="/admin/brok"
              className="inline-flex min-h-11 min-w-11 items-center rounded-md px-2 leading-none"
            >
              Admin panel
            </Link>
          </li>
          <li>
            <Link
              href="/usage"
              className="inline-flex min-h-11 min-w-11 items-center rounded-md px-2 leading-none"
            >
              Usage
            </Link>
          </li>
          <li>
            <Link
              href="/billing"
              className="inline-flex min-h-11 min-w-11 items-center rounded-md px-2 leading-none"
            >
              Billing
            </Link>
          </li>
          <li>
            <Link
              href="/api-keys"
              className="inline-flex min-h-11 min-w-11 items-center rounded-md px-2 leading-none"
            >
              API keys
            </Link>
          </li>
        </ul>
      </div>
    </div>
  )
}
