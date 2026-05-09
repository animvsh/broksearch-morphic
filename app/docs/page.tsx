export default function DocsPage() {
  return (
    <div className="container py-8">
      <h1 className="text-4xl font-bold mb-4">Brok Documentation</h1>
      <p className="text-xl text-muted-foreground mb-8">
        Build with Brok's AI API in minutes
      </p>

      <div className="grid md:grid-cols-3 gap-6">
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
      </div>
    </div>
  );
}

function DocCard({ title, description, href }: { title: string; description: string; href: string }) {
  return (
    <a
      href={href}
      className="block p-6 rounded-lg border hover:border-primary hover:bg-muted/50 transition-colors"
    >
      <h2 className="text-lg font-semibold mb-2">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </a>
  );
}
