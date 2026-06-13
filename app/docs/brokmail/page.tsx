import Link from 'next/link'

export default function BrokMailDocsPage() {
  return (
    <div className="container max-w-3xl py-8">
      <h1 className="mb-4 text-4xl font-bold">BrokMail</h1>
      <p className="mb-8 text-xl text-muted-foreground">
        BrokMail is the email workspace for Gmail, Calendar, and a concise Pi
        assistant that prepares actions for user approval.
      </p>

      <div className="prose prose-neutral dark:prose-invert">
        <h2>Layout</h2>
        <p>
          The main workspace is an inbox list, selected thread, and assistant.
          Desktop keeps the assistant visible on the right; smaller screens open
          it as a focused panel.
        </p>

        <h2>Connections</h2>
        <p>
          Gmail and Calendar connect through Composio popups. A successful
          connection returns to <code>/brokmail</code> with connected account
          status; BrokMail then fetches live threads and events through the
          configured toolkit.
        </p>

        <h2>Approval-gated actions</h2>
        <ul>
          <li>Draft creation requires a visible review before send or save.</li>
          <li>Archive actions require explicit approval.</li>
          <li>Calendar create and delete actions require explicit approval.</li>
          <li>
            The assistant must not claim an external action happened until the
            approval endpoint succeeds.
          </li>
        </ul>

        <h2>Useful routes</h2>
        <ul>
          <li>
            <code>/brokmail</code> opens the product.
          </li>
          <li>
            <code>/api/brokmail/gmail/threads</code> fetches Gmail threads.
          </li>
          <li>
            <code>/api/brokmail/gcal/events</code> fetches Calendar events.
          </li>
          <li>
            <code>/api/brokmail/pi-agent</code> runs the Pi assistant.
          </li>
        </ul>

        <p>
          For connection setup, see{' '}
          <Link href="/docs/integrations">Integrations</Link>.
        </p>
      </div>
    </div>
  )
}
