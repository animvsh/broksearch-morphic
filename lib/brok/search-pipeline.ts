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

  // Use MiniMax web search tool to get search results with citations
  const { results: searchResults, answer, tokensUsed } = await runMiniMaxWebSearch(
    request.query,
    config.sources,
    config.maxTokens,
    request.recencyDays
  );

  return {
    answer,
    citations: searchResults.map((r, i) => ({
      id: `src_${i + 1}`,
      title: r.title,
      url: r.url,
      publisher: r.publisher,
      snippet: r.snippet,
      retrievedAt: r.retrievedAt,
    })),
    searchQueries: 1,
    tokensUsed,
  };
}

interface MiniMaxSearchResult {
  id: string;
  title: string;
  url: string;
  publisher?: string;
  snippet: string;
  retrievedAt: string;
}

interface MiniMaxWebSearchResponse {
  results: MiniMaxSearchResult[];
  answer: string;
  tokensUsed: number;
}

async function runMiniMaxWebSearch(
  query: string,
  numResults: number,
  maxTokens: number,
  recencyDays?: number
): Promise<MiniMaxWebSearchResponse> {
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
          role: 'user',
          content: query,
        },
      ],
      tools: [
        {
          type: 'web_search',
          web_search: {
            top_n: numResults,
          },
        },
      ],
      tool_choice: {
        type: 'web_search',
        web_search: {
          top_n: numResults,
        },
      },
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`MiniMax web search error: ${response.status} - ${error}`);
  }

  const data = await response.json();

  // Extract search results and answer from tool calls or content
  const searchResults: MiniMaxSearchResult[] = [];
  let answer = '';

  // Check if there are tool calls in the response
  if (data.choices?.[0]?.message?.tool_calls) {
    const toolCall = data.choices[0].message.tool_calls[0];
    if (toolCall.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      if (parsed.result?.web_pages) {
        searchResults.push(
          ...parsed.result.web_pages.map((page: any, i: number) => ({
            id: `minimax_${i}`,
            title: page.title || 'Untitled',
            url: page.url,
            publisher: page.publisher,
            snippet: page.description || page.snippet || '',
            retrievedAt: new Date().toISOString(),
          }))
        );
      }
      if (parsed.result?.answer) {
        answer = parsed.result.answer;
      }
    }
  }

  // If no tool calls, check for content with citations
  if (searchResults.length === 0 && data.choices?.[0]?.message?.content) {
    answer = data.choices[0].message.content;
  }

  // Fallback: if we have citations in the response, extract them
  if (data.citations && Array.isArray(data.citations)) {
    searchResults.push(
      ...data.citations.map((cite: any, i: number) => ({
        id: `minimax_${i}`,
        title: cite.title || 'Untitled',
        url: cite.url,
        publisher: cite.publisher,
        snippet: cite.snippet || cite.description || '',
        retrievedAt: new Date().toISOString(),
      }))
    );
  }

  const tokensUsed = data.usage?.total_tokens || Math.round((answer.length + searchResults.join('').length) / 4);

  return {
    results: searchResults.slice(0, numResults),
    answer: answer || 'No answer generated.',
    tokensUsed,
  };
}
