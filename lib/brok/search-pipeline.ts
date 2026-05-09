import { BROK_MODELS } from './models';

export interface SearchResult {
  id: string;
  title: string;
  url: string;
  publisher?: string;
  snippet: string;
  retrievedAt: string;
}

export interface SearchResponse {
  answer: string;
  citations: SearchResult[];
  searchQueries: number;
  tokensUsed: number;
}

export interface SearchRequest {
  query: string;
  depth: 'lite' | 'standard' | 'deep';
  recencyDays?: number;
  domains?: string[];
}

const SEARCH_CONFIG = {
  lite: { sources: 3, maxTokens: 8000 },
  standard: { sources: 8, maxTokens: 16000 },
  deep: { sources: 20, maxTokens: 32000 },
};

export async function runSearchPipeline(request: SearchRequest): Promise<SearchResponse> {
  const config = SEARCH_CONFIG[request.depth];
  const startTime = Date.now();

  // Step 1: Rewrite query for search (could use a separate model)
  const searchQuery = await rewriteQuery(request.query);

  // Step 2: Run web searches
  const searchResults = await runWebSearch(searchQuery, config.sources, request.recencyDays, request.domains);

  // Step 3: Fetch and extract content from top sources
  const enrichedResults = await enrichSearchResults(searchResults.slice(0, config.sources));

  // Step 4: Deduplicate and rank
  const deduplicated = deduplicateResults(enrichedResults);

  // Step 5: Build context for synthesis
  const context = buildContext(deduplicated);

  // Step 6: Generate answer with MiniMax
  const answer = await synthesizeAnswer(request.query, context, config.maxTokens);

  const latencyMs = Date.now() - startTime;

  return {
    answer,
    citations: deduplicated.map((r, i) => ({
      id: `src_${i + 1}`,
      title: r.title,
      url: r.url,
      publisher: r.publisher,
      snippet: r.snippet,
      retrievedAt: new Date().toISOString(),
    })),
    searchQueries: searchResults.length,
    tokensUsed: Math.round(context.length / 4), // Rough estimate
  };
}

async function rewriteQuery(query: string): Promise<string> {
  // Use a simple approach - could be enhanced with a model
  return query;
}

async function runWebSearch(
  query: string,
  numResults: number,
  recencyDays?: number,
  domains?: string[]
): Promise<SearchResult[]> {
  const tavilyKey = process.env.TAVILY_API_KEY;
  const results: SearchResult[] = [];

  if (tavilyKey) {
    const params = new URLSearchParams({
      api_key: tavilyKey,
      query,
      max_results: String(numResults),
    });
    if (recencyDays) params.set('recency_days', String(recencyDays));
    if (domains?.length) params.set('domains', domains.join(','));

    const response = await fetch(`https://api.tavily.com/search?${params}`);
    const data = await response.json();

    results.push(
      ...(data.results || []).map((r: any, i: number) => ({
        id: `tavily_${i}`,
        title: r.title,
        url: r.url,
        publisher: r.source,
        snippet: r.content,
        retrievedAt: new Date().toISOString(),
      }))
    );
  }

  return results.slice(0, numResults);
}

async function enrichSearchResults(results: SearchResult[]): Promise<SearchResult[]> {
  // Extract clean content from pages using Firecrawl or similar
  const firecrawlKey = process.env.FIRECRAWL_API_KEY;

  if (!firecrawlKey) {
    return results;
  }

  const enriched = await Promise.all(
    results.map(async (result) => {
      try {
        const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${firecrawlKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: result.url,
            pageOptions: { onlyMainContent: true },
          }),
        });

        if (response.ok) {
          const data = await response.json();
          return {
            ...result,
            snippet: data.data?.content?.slice(0, 500) || result.snippet,
          };
        }
      } catch {}
      return result;
    })
  );

  return enriched;
}

function deduplicateResults(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  return results.filter((r) => {
    const key = r.url.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildContext(results: SearchResult[]): string {
  return results
    .map((r, i) => `[Source ${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet}`)
    .join('\n\n');
}

async function synthesizeAnswer(
  query: string,
  context: string,
  maxTokens: number
): Promise<string> {
  const minimaxKey = process.env.MINIMAX_API_KEY;

  if (!minimaxKey) {
    throw new Error('MiniMax API key not configured');
  }

  const response = await fetch('https://api.minimax.chat/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${minimaxKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'minimax-text',
      messages: [
        {
          role: 'system',
          content: `You are a helpful assistant. Answer the user's question based on the provided search results. Cite your sources using the format [Source N].`,
        },
        {
          role: 'user',
          content: `Search Results:\n${context}\n\nQuestion: ${query}`,
        },
      ],
      max_tokens: maxTokens,
    }),
  });

  const data = await response.json();
  return data.choices?.[0]?.message?.content || 'No answer generated.';
}
