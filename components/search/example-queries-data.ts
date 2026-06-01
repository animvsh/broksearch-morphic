export interface ExampleQuery {
  id: string
  query: string
  category: 'research' | 'code' | 'comparison' | 'how-to' | 'news' | 'explain'
  mode?: 'quick' | 'search' | 'deep' | 'code'
}

export const EXAMPLE_QUERIES: ExampleQuery[] = [
  {
    id: 'ex-1',
    query: 'What are the latest advances in fusion energy as of 2026?',
    category: 'research',
    mode: 'deep'
  },
  {
    id: 'ex-2',
    query: 'Compare Postgres, SQLite, and DuckDB for a SaaS analytics backend',
    category: 'comparison',
    mode: 'search'
  },
  {
    id: 'ex-3',
    query: 'How does React Server Components actually work under the hood?',
    category: 'explain',
    mode: 'search'
  },
  {
    id: 'ex-4',
    query: 'Write a Python script to deduplicate a 10M-row CSV by email',
    category: 'code',
    mode: 'code'
  },
  {
    id: 'ex-5',
    query: 'What changed in the Fed\'s rate policy this quarter?',
    category: 'news',
    mode: 'search'
  },
  {
    id: 'ex-6',
    query: 'How do I tune Postgres autovacuum for a write-heavy table?',
    category: 'how-to',
    mode: 'quick'
  },
  {
    id: 'ex-7',
    query: 'Explain the difference between RAG and fine-tuning in production',
    category: 'explain',
    mode: 'search'
  },
  {
    id: 'ex-8',
    query: 'Best practices for designing a real-time multiplayer game protocol',
    category: 'research',
    mode: 'deep'
  },
  {
    id: 'ex-9',
    query: 'Write a TypeScript Zod schema for a complex nested form',
    category: 'code',
    mode: 'code'
  },
  {
    id: 'ex-10',
    query: 'What are the most cited ML papers of the last 12 months?',
    category: 'research',
    mode: 'deep'
  },
  {
    id: 'ex-11',
    query: 'Compare Vercel, Cloudflare Pages, and Netlify for a Next.js app',
    category: 'comparison',
    mode: 'search'
  },
  {
    id: 'ex-12',
    query: 'How do I debug a memory leak in a Node.js production service?',
    category: 'how-to',
    mode: 'quick'
  }
]
