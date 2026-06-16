import Link from 'next/link'

const scopeRows = [
  ['chat:write', 'Create OpenAI-compatible chat completions.'],
  ['search:write', 'Create search completions and search-backed answers.'],
  ['code:write', 'Run BrokCode model and coding-agent requests.'],
  ['agents:write', 'Run agent workflows that act on your behalf.'],
  ['usage:read', 'Read usage totals, model metadata, and pricing fields.'],
  ['logs:read', 'Read logs where that surface is enabled.']
] as const

export default function ApiKeysPage() {
  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8 max-w-3xl">
        <h1 className="mb-4 text-4xl font-bold">API Keys</h1>
        <p className="text-lg text-muted-foreground">
          Brok API keys are workspace-scoped secrets for trusted servers, local
          developer machines, and CLI tools. Treat every key like a password:
          Brok shows the full value once, stores only verifiers, and enforces
          scopes, status, model access, and rate limits on every API request.
          Keys can be created with no expiration or with a future expiration
          timestamp for temporary access.
        </p>
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Header</p>
          <code className="mt-2 block break-all text-sm">
            Authorization: Bearer brok_sk_...
          </code>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Alternate header</p>
          <code className="mt-2 block break-all text-sm">
            x-api-key: brok_sk_...
          </code>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Endpoint</p>
          <code className="mt-2 block break-all text-sm">
            https://www.brok.fyi/api/v1
          </code>
        </div>
      </div>

      <div className="prose prose-neutral max-w-none dark:prose-invert">
        <h2>Lifecycle At A Glance</h2>
        <ol>
          <li>Create a live or test key from your signed-in Brok workspace.</li>
          <li>
            Copy the raw secret immediately. Brok returns it only in the create
            response and cannot show it again later.
          </li>
          <li>
            Store the key in a server-side secret store or local developer env,
            never in browser storage, app source, analytics, screenshots, or
            issue trackers.
          </li>
          <li>
            Use scopes, model allowlists, RPM, daily request limits, and monthly
            budget caps, plus optional expiration, to narrow blast radius.
          </li>
          <li>
            Pause a key for temporary shutdown, let temporary keys expire, or
            revoke a key permanently and replace it with a newly generated key.
          </li>
        </ol>

        <h2>Key Format And Prefixes</h2>
        <p>
          Brok accepts keys that start with <code>brok_sk_</code>. Production
          cloud keys use one of these environment prefixes:
        </p>
        <ul>
          <li>
            <code>brok_sk_live_...</code> for production traffic and real usage.
          </li>
          <li>
            <code>brok_sk_test_...</code> for development, smoke tests, and the
            hosted playground session key.
          </li>
        </ul>
        <p>
          Brok stores a short lookup prefix from the beginning of the key so the
          auth path can find candidate rows without scanning every active key.
          The prefix is safe to display in dashboards and logs, but it is still
          not a credential. Do not use prefixes as access tokens.
        </p>

        <h2>Storage Model</h2>
        <p>
          The full API secret is never stored as plaintext by the API key
          manager. New keys are stored as a SHA-256 verifier derived from the
          raw key, a per-key random salt, and the deployment-wide{' '}
          <code>API_KEY_SALT</code>. Older legacy rows can still be verified
          during migration, but new rows use the per-key salt path.
        </p>
        <p>
          On each request, Brok checks the bearer token shape, finds prefix
          candidates, verifies the salted hash using constant-time comparison,
          confirms the key is active, confirms the workspace is active, and only
          then evaluates scopes, models, limits, and usage reservations.
        </p>

        <h2>Lifecycle Audit Events</h2>
        <p>
          Brok persists API key lifecycle audit events for user and admin
          operations. The current audit log records key creation, the one-time
          create-response reveal, pause, resume, revoke, playground session
          expiry updates, and system revocation of expired or rotated playground
          backing keys. Event types are reserved for future key rotation,
          explicit secret acknowledgement, and denied expired-key usage when
          those lifecycle paths are available.
        </p>
        <p>
          Audit events include actor type, actor user ID when available, API key
          ID, key prefix, event type, timestamp, request ID, IP address, user
          agent, and safe metadata. Full API secrets, hashes, salts,
          authorization headers, and token-like metadata are redacted before
          persistence.
        </p>
        <p>
          Users can inspect recent events from{' '}
          <Link href="/api-platform/audit">API Manager Audit</Link>. Admins can
          inspect recent lifecycle events from the Brok API Keys admin view.
        </p>

        <h2>Scopes</h2>
        <p>
          Scopes are enforced route by route. Grant only the permissions a
          workload needs; the wildcard scope exists for privileged internal
          cases, but production integrations should prefer explicit scopes.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="px-3 py-2 text-left">Scope</th>
                <th className="px-3 py-2 text-left">Use</th>
              </tr>
            </thead>
            <tbody>
              {scopeRows.map(([scope, description]) => (
                <tr className="border-b" key={scope}>
                  <td className="px-3 py-2 font-mono">{scope}</td>
                  <td className="px-3 py-2">{description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2>Zero-Downtime Rotation</h2>
        <p>
          Rotate from the API key table when a production app needs a fresh
          credential. Brok creates a replacement key with the source key&apos;s
          environment, scopes, model allowlist, RPM limit, daily request limit,
          and monthly budget unless you edit them before generation.
        </p>
        <ol>
          <li>Click Rotate on the active key you want to replace.</li>
          <li>
            Review the inherited settings, narrow anything that should change,
            then generate the replacement.
          </li>
          <li>
            Copy the new secret immediately. Rotation preserves the same
            one-time reveal rule as key creation.
          </li>
          <li>
            Deploy the replacement through your server-side secret store while
            leaving the old key active.
          </li>
          <li>
            Send a low-risk request with the replacement and save the returned
            request ID.
          </li>
          <li>
            Move traffic, monitor usage for the replacement key, then revoke the
            source key from the same table.
          </li>
        </ol>
        <p>
          The key table shows which key replaces which credential using names,
          prefixes, statuses, and timestamps only. Brok never stores or displays
          either raw secret after its one-time reveal.
        </p>

        <h2>Expiration And Revocation</h2>
        <p>
          User-created keys support no expiration or a future expiration time.
          Expired keys are rejected before scope checks, rate limits, usage
          reservations, provider calls, billing, or last-used mutations. Paused
          keys can be resumed, but expiration is not extended automatically.
          Revocation is final: revoked keys cannot be resumed, so create a
          replacement key before cutting over production traffic.
        </p>

        <h2>Server-Side Storage</h2>
        <p>
          Store API keys only in trusted secret stores: Railway or Vercel
          environment variables, Supabase vaults, CI repository secrets, or a
          local <code>.env.local</code> that is ignored by git. Do not place
          Brok keys in <code>NEXT_PUBLIC_*</code>, <code>VITE_*</code>, static
          frontend bundles, generated app source, localStorage, sessionStorage,
          IndexedDB, cookies readable by client JavaScript, logs, analytics
          events, or bug reports.
        </p>

        <h2>Local Development And CI</h2>
        <pre className="rounded-lg bg-muted p-4">
          <code>{`# .env.local, shell profile, or CI secret store
BROK_API_KEY="brok_sk_test_your_key_here"
OPENAI_API_KEY="$BROK_API_KEY"
OPENAI_BASE_URL="https://www.brok.fyi/api/v1"
OPENAI_MODEL="brok-code"`}</code>
        </pre>
        <p>
          For local-only smoke runs, Brok can be configured with an explicit
          fallback key using <code>BROK_ENABLE_LOCAL_AUTH_FALLBACK=true</code>{' '}
          and <code>BROK_SMOKE_API_KEY</code>. That fallback is intentionally
          disabled in Brok cloud deployments and should not be used as a
          production auth path. CI should use repository secrets and redacted
          scanners; never print raw keys in job logs.
        </p>

        <h2>Browser Playground Posture</h2>
        <p>
          The hosted API playground does not require users to paste production
          keys into the browser. Signed-in users get an account-owned,
          server-side test session key that Brok stores encrypted for the
          playground proxy. The hosted route rejects browser-supplied raw API
          keys, so production secrets stay in server-side stores instead of
          client requests.
        </p>

        <h2>Request IDs And Debugging</h2>
        <p>
          API responses include a Brok request identifier such as{' '}
          <code>X-Brok-Request-Id</code> or the proxied{' '}
          <code>x-request-id</code>
          from playground calls. Save request IDs when reporting failures or
          investigating rate limits, usage, or provider behavior. Never include
          the raw API key in support tickets.
        </p>

        <h2>What Brok Never Stores Or Exposes</h2>
        <ul>
          <li>
            The raw user-created API key after the one-time create response.
          </li>
          <li>Full API secrets in dashboard list views or admin logs.</li>
          <li>
            Full API secrets, hashes, salts, or authorization headers in
            lifecycle audit events.
          </li>
          <li>Browser-local copies of hosted playground session keys.</li>
          <li>Raw secret values from deployment checks or secret scans.</li>
        </ul>

        <h2>Direct API Request</h2>
        <pre className="rounded-lg bg-muted p-4">
          <code>{`curl https://www.brok.fyi/api/v1/chat/completions \\
  -H "Authorization: Bearer $BROK_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "brok-code",
    "messages": [
      {"role": "user", "content": "Review this repo change and propose tests."}
    ],
    "stream": true
  }'`}</code>
        </pre>

        <h2>Next Steps</h2>
        <ul>
          <li>
            <Link href="/api-platform/keys">Create or revoke API keys</Link>
          </li>
          <li>
            <Link href="/api-platform/playground">
              Run a request in the playground
            </Link>
          </li>
          <li>
            <Link href="/docs/rate-limits">Understand rate limits</Link>
          </li>
          <li>
            <Link href="/docs/security">Review security best practices</Link>
          </li>
        </ul>
      </div>
    </div>
  )
}
