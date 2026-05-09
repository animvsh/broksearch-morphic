export default function QuickstartPage() {
  return (
    <div className="container py-8 max-w-3xl">
      <h1 className="text-4xl font-bold mb-6">Quickstart</h1>

      <div className="prose prose-neutral dark:prose-invert">
        <h2>1. Create an account</h2>
        <p>Sign up for Brok at brok.ai and create your workspace.</p>

        <h2>2. Create an API key</h2>
        <p>Go to your dashboard and create a new API key. Choose your environment (test or live) and set rate limits.</p>

        <h2>3. Make your first request</h2>

        <pre className="bg-muted p-4 rounded-lg">
          <code>{`curl https://api.brok.ai/v1/chat/completions \\
  -H "Authorization: Bearer brok_sk_live_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "brok-lite",
    "messages": [
      {"role": "user", "content": "Hello, Brok!"}
    ]
  }'`}</code>
        </pre>

        <h2>4. View your usage</h2>
        <p>Track your API usage in the dashboard and set budgets to control costs.</p>

        <h2>Next steps</h2>
        <ul>
          <li><a href="/docs/chat-completions">Chat Completions API</a></li>
          <li><a href="/docs/search-completions">Search Completions API</a></li>
          <li><a href="/docs/models">Available Models</a></li>
        </ul>
      </div>
    </div>
  );
}
