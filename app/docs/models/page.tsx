import { BROK_MODELS } from '@/lib/brok/models';

export default function ModelsPage() {
  const models = Object.entries(BROK_MODELS).map(([id, config]) => ({
    id,
    ...config,
  }));

  return (
    <div className="container py-8 max-w-3xl">
      <h1 className="text-4xl font-bold mb-6">Models</h1>

      <div className="prose prose-neutral dark:prose-invert mb-8">
        <p>Brok offers multiple models optimized for different use cases.</p>
      </div>

      <div className="space-y-6">
        {models.map((model) => (
          <div key={model.id} className="border rounded-lg p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold">{model.name}</h2>
                <code className="text-sm text-muted-foreground">{model.id}</code>
              </div>
              <div className="text-right">
                <div className="text-sm">${model.inputCostPerMillion}/1M in</div>
                <div className="text-sm text-muted-foreground">${model.outputCostPerMillion}/1M out</div>
              </div>
            </div>
            <p className="text-muted-foreground mb-4">{model.description}</p>
            <div className="flex flex-wrap gap-2">
              {model.supportsSearch && (
                <span className="px-2 py-1 bg-secondary text-secondary-foreground rounded text-xs">
                  Search
                </span>
              )}
              {model.supportsTools && (
                <span className="px-2 py-1 bg-secondary text-secondary-foreground rounded text-xs">
                  Tools
                </span>
              )}
              {model.supportsStreaming && (
                <span className="px-2 py-1 bg-secondary text-secondary-foreground rounded text-xs">
                  Streaming
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
