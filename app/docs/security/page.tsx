'use client'

import Link from 'next/link'

import { CopyButton } from '@/components/copy-button'

const pageContent = `# Security Best Practices

Keep Brok API keys server-side, scoped, monitored, and easy to rotate.

## API Key Posture

### One-Time Reveal

Brok shows a full user-created API key only once, during creation. After that,
the dashboard displays a prefix or masked value only. If you lose the secret,
create a replacement key and revoke the old one.

### Storage Model

Brok stores a lookup prefix plus a salted verifier, not the raw key. New keys
use a per-key random salt and the deployment-wide API_KEY_SALT. Request auth
uses prefix lookup, salted verification, constant-time comparison, active key
status, and active workspace checks before scopes and rate limits are evaluated.

### Prefixes

| Prefix | Environment | Use Case |
|--------|-------------|----------|
| \`brok_sk_live_\` | Production | Real traffic and actual usage |
| \`brok_sk_test_\` | Testing | Development, smoke tests, and playground sessions |

### Scopes

Grant the smallest useful scope set. Common scopes are \`chat:write\`,
\`search:write\`, \`code:write\`, \`agents:write\`, \`usage:read\`, and
\`logs:read\`. Pair scopes with model allowlists, RPM limits, daily request
limits, and monthly budget caps.

## Secret Handling

### Browser Storage

Do not store full Brok API secrets in localStorage, sessionStorage, IndexedDB,
client-readable cookies, analytics payloads, or client-visible app state. The
hosted playground uses an account-owned server-side test session key by default.
Production apps should call Brok from trusted server code.

### Server-Side Storage

Use environment variables or managed secret stores:

\`\`\`bash
# .env.local, shell profile, or CI secret store
BROK_API_KEY=brok_sk_test_your_key_here
\`\`\`

Never place Brok secrets in \`NEXT_PUBLIC_*\`, \`VITE_*\`, generated browser
source, screenshots, logs, issue trackers, or documentation examples.

### CI And Local Scans

Use repository secrets for CI and run redacted scanners before sharing output:

\`\`\`bash
bun run scan:secrets
bun run scan:secrets -- --staged
bun run scan:secrets:local
\`\`\`

The scanner reports file, line, and rule names only. If a real value appears in
a local checkout, treat it as exposed and rotate it at the provider.

## Zero-Downtime Rotation

1. Rotate from the active key row in the API key table.
2. Review the inherited scopes, model allowlist, RPM, daily limit, and monthly
   budget, then narrow anything that should change.
3. Copy the replacement secret immediately. Brok reveals it once.
4. Deploy the replacement through your server-side secret store while the source
   key stays active.
5. Verify it with a low-risk request and save the returned request ID.
6. Move traffic and monitor usage.
7. Revoke the source key.

The dashboard shows rotation relationships with names, prefixes, statuses, and
timestamps only. Raw source and replacement secrets are never displayed after
their one-time reveal.

## Revocation

Pause is for temporary shutdowns. Revocation is final. User-created keys do not
yet have general persistent expiration; playground session keys are server-side
test keys with a 24-hour TTL.

## Application Security

### Server-Side Only

\`\`\`javascript
// Bad: exposes your key to every browser user.
await fetch('https://api.brok.ai/v1/chat/completions', {
  headers: { Authorization: 'Bearer ' + apiKey }
})

// Good: your server reads BROK_API_KEY from a secret store.
app.post('/api/chat', async (req, res) => {
  const response = await brok.chat.completions.create({
    messages: req.body.messages
  })
  res.json(response)
})
\`\`\`

### Request IDs

Capture \`X-Brok-Request-Id\` or proxied \`x-request-id\` values when debugging.
Share request IDs with support, not raw API keys.

### What Brok Never Stores Or Exposes

- Raw user-created API keys after one-time reveal.
- Full API secrets in key lists or admin logs.
- Browser-local copies of hosted playground session keys.
- Raw secret values from deployment checks or secret scans.

## Security Checklist

- [ ] API keys live only in server-side secret stores or ignored local env files.
- [ ] Browser code never reads or persists full API keys.
- [ ] Keys use explicit scopes, model allowlists, RPM, daily, and budget limits.
- [ ] Test keys are used for development and playground work.
- [ ] Request IDs are captured for debugging.
- [ ] Old keys are revoked after rotation.
- [ ] Secret scans run before PRs and incident handoffs.
- [ ] HTTPS is used for every production request.

## Reporting Security Issues

Email security@brok.ai. Do not disclose publicly or include raw secret values in
the report.

## Next Steps

- [API Keys](/docs/api-keys) - Create, store, rotate, and revoke keys
- [Rate Limits](/docs/rate-limits) - Understand limit and retry behavior
- [Errors](/docs/errors) - Handle auth and permission errors`

export default function SecurityPage() {
  return (
    <div className="container max-w-3xl py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-4xl font-bold">Security Best Practices</h1>
        <CopyButton content={pageContent} />
      </div>

      <div className="prose prose-neutral dark:prose-invert">
        <p className="text-xl text-muted-foreground">
          Keep Brok API keys server-side, scoped, monitored, and easy to rotate.
        </p>

        <h2>API Key Posture</h2>

        <h3>One-Time Reveal</h3>
        <p>
          Brok shows a full user-created API key only once, during creation.
          After that, the dashboard displays a prefix or masked value only. If
          you lose the secret, create a replacement key and revoke the old one.
        </p>

        <h3>Storage Model</h3>
        <p>
          Brok stores a lookup prefix plus a salted verifier, not the raw key.
          New keys use a per-key random salt and the deployment-wide{' '}
          <code>API_KEY_SALT</code>. Request auth uses prefix lookup, salted
          verification, constant-time comparison, active key status, and active
          workspace checks before scopes and rate limits are evaluated.
        </p>

        <h3>Prefixes</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="px-3 py-2 text-left">Prefix</th>
                <th className="px-3 py-2 text-left">Environment</th>
                <th className="px-3 py-2 text-left">Use Case</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="px-3 py-2 font-mono">brok_sk_live_</td>
                <td className="px-3 py-2">Production</td>
                <td className="px-3 py-2">Real traffic and actual usage</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-mono">brok_sk_test_</td>
                <td className="px-3 py-2">Testing</td>
                <td className="px-3 py-2">
                  Development, smoke tests, and playground sessions
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3>Scopes</h3>
        <p>
          Grant the smallest useful scope set. Common scopes are{' '}
          <code>chat:write</code>, <code>search:write</code>,{' '}
          <code>code:write</code>, <code>agents:write</code>,{' '}
          <code>usage:read</code>, and <code>logs:read</code>. Pair scopes with
          model allowlists, RPM limits, daily request limits, and monthly budget
          caps.
        </p>

        <h2>Secret Handling</h2>

        <h3>Browser Storage</h3>
        <p>
          Do not store full Brok API secrets in localStorage, sessionStorage,
          IndexedDB, client-readable cookies, analytics payloads, or
          client-visible app state. The hosted playground uses an account-owned
          server-side test session key by default. Production apps should call
          Brok from trusted server code.
        </p>

        <h3>Server-Side Storage</h3>
        <p>Use environment variables or managed secret stores:</p>
        <pre className="rounded-lg bg-muted p-4">
          <code>{`# .env.local, shell profile, or CI secret store
BROK_API_KEY=brok_sk_test_your_key_here`}</code>
        </pre>
        <p>
          Never place Brok secrets in <code>NEXT_PUBLIC_*</code>,{' '}
          <code>VITE_*</code>, generated browser source, screenshots, logs,
          issue trackers, or documentation examples.
        </p>

        <h3>CI And Local Scans</h3>
        <p>Use repository secrets for CI and run redacted scanners:</p>
        <pre className="rounded-lg bg-muted p-4">
          <code>{`bun run scan:secrets
bun run scan:secrets -- --staged
bun run scan:secrets:local`}</code>
        </pre>
        <p>
          The scanner reports file, line, and rule names only. If a real value
          appears in a local checkout, treat it as exposed and rotate it at the
          provider.
        </p>

        <h2>Zero-Downtime Rotation</h2>
        <ol>
          <li>Rotate from the active key row in the API key table.</li>
          <li>
            Review the inherited scopes, model allowlist, RPM, daily limit, and
            monthly budget, then narrow anything that should change.
          </li>
          <li>
            Copy the replacement secret immediately. Brok reveals it once.
          </li>
          <li>Deploy the new key through your server-side secret store.</li>
          <li>
            Verify it with a low-risk request and save the returned request ID.
          </li>
          <li>Move traffic and monitor usage.</li>
          <li>Revoke the source key.</li>
        </ol>
        <p>
          The dashboard shows rotation relationships with names, prefixes,
          statuses, and timestamps only. Raw source and replacement secrets are
          never displayed after their one-time reveal.
        </p>

        <h2>Revocation</h2>
        <p>
          Pause is for temporary shutdowns. Revocation is final. User-created
          keys do not yet have general persistent expiration; playground session
          keys are server-side test keys with a 24-hour TTL.
        </p>

        <h2>Application Security</h2>

        <h3>Server-Side Only</h3>
        <pre className="rounded-lg bg-muted p-4">
          <code>{`// Bad: exposes your key to every browser user.
await fetch('https://api.brok.ai/v1/chat/completions', {
  headers: { Authorization: 'Bearer ' + apiKey }
})

// Good: your server reads BROK_API_KEY from a secret store.
app.post('/api/chat', async (req, res) => {
  const response = await brok.chat.completions.create({
    messages: req.body.messages
  })
  res.json(response)
})`}</code>
        </pre>

        <h3>Request IDs</h3>
        <p>
          Capture <code>X-Brok-Request-Id</code> or proxied{' '}
          <code>x-request-id</code> values when debugging. Share request IDs
          with support, not raw API keys.
        </p>

        <h3>What Brok Never Stores Or Exposes</h3>
        <ul>
          <li>Raw user-created API keys after one-time reveal.</li>
          <li>Full API secrets in key lists or admin logs.</li>
          <li>Browser-local copies of hosted playground session keys.</li>
          <li>Raw secret values from deployment checks or secret scans.</li>
        </ul>

        <h2>Security Checklist</h2>
        <ul>
          <li>
            [ ] API keys live only in server-side secret stores or ignored local
            env files.
          </li>
          <li>[ ] Browser code never reads or persists full API keys.</li>
          <li>
            [ ] Keys use explicit scopes, model allowlists, RPM, daily, and
            budget limits.
          </li>
          <li>[ ] Test keys are used for development and playground work.</li>
          <li>[ ] Request IDs are captured for debugging.</li>
          <li>[ ] Old keys are revoked after rotation.</li>
          <li>[ ] Secret scans run before PRs and incident handoffs.</li>
          <li>[ ] HTTPS is used for every production request.</li>
        </ul>

        <h2>Reporting Security Issues</h2>
        <p>
          Email security@brok.ai. Do not disclose publicly or include raw secret
          values in the report.
        </p>

        <h2>Next Steps</h2>
        <ul>
          <li>
            <Link href="/docs/api-keys">API Keys</Link> - Create, store, rotate,
            and revoke keys
          </li>
          <li>
            <Link href="/docs/rate-limits">Rate Limits</Link> - Understand limit
            and retry behavior
          </li>
          <li>
            <Link href="/docs/errors">Errors</Link> - Handle auth and permission
            errors
          </li>
        </ul>
      </div>
    </div>
  )
}
