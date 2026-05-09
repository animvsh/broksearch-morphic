export default function ApiKeysPage() {
  return (
    <div className="container py-8 max-w-3xl">
      <h1 className="text-4xl font-bold mb-6">API Keys</h1>

      <div className="prose prose-neutral dark:prose-invert">
        <p>Brok uses API keys to authenticate requests. Each key has specific permissions and rate limits.</p>

        <h2>Key Format</h2>
        <ul>
          <li><code>brok_sk_live_...</code> - Live environment keys</li>
          <li><code>brok_sk_test_...</code> - Test environment keys</li>
        </ul>

        <h2>Creating Keys</h2>
        <p>Create API keys from the Brok dashboard. Each key can be configured with:</p>
        <ul>
          <li>Name and environment</li>
          <li>Allowed models</li>
          <li>Rate limits (RPM, daily)</li>
          <li>Monthly budget cap</li>
        </ul>

        <h2>Key Security</h2>
        <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 my-4">
          <p className="text-yellow-800"><strong>Important:</strong> Your API key is only shown once after creation. Store it securely.</p>
        </div>
      </div>
    </div>
  );
}
