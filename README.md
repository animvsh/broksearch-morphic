<div align="center">

# Brok

An AI answer engine and developer API platform — Perplexity-style chat with Sonar-style API access.

[![GitHub stars](https://img.shields.io/github/stars/animvsh/broksearch-morphic?style=flat&colorA=000000&colorB=000000)](https://github.com/animvsh/broksearch-morphic/stargazers) [![GitHub forks](https://img.shields.io/github/forks/animvsh/broksearch-morphic?style=flat&colorA=000000&colorB=000000)](https://github.com/animvsh/broksearch-morphic/network/members)

<br />
<br />

</div>

## Features

### Brok Chat

- Perplexity-style AI search with citations and streaming responses
- Model selector with Brok models and provider routing
- Multiple search providers (Tavily, SearXNG, Brave, Exa)
- Chat history stored in PostgreSQL
- Share search results with unique URLs

### Brok API

- OpenAI-compatible API endpoints
- API key management with scopes and rate limits
- Usage metering and tracking
- Developer playground for testing
- Usage dashboard and logs

### Admin Panel

- Brok API management section
- User and workspace management
- Provider routing configuration
- Cost monitoring and abuse detection

## Quick Start

### Docker (Recommended)

```bash
docker compose up -d
```

Visit http://localhost:3000

### Local Development

```bash
bun install
cp .env.local.example .env.local
# Configure your API keys in .env.local
bun dev
```

## API

Get your API key from the dashboard and start making requests:

```bash
curl https://api.brok.ai/v1/chat/completions \
  -H "Authorization: Bearer brok_sk_live_your_key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "brok-search",
    "messages": [{"role": "user", "content": "What is Brok?"}]
  }'
```

## Available Models

| Model           | Description                           |
| --------------- | ------------------------------------- |
| brok-lite       | Fast, low-cost reasoning              |
| brok-search     | Search-powered answers with citations |
| brok-search-pro | Deep search with 10-20 sources        |
| brok-code       | Code understanding and generation     |
| brok-agent      | Tool-using agent                      |
| brok-reasoning  | Advanced reasoning                    |

## Documentation

See [docs](./docs/) for full documentation.

## License

Apache License 2.0 - see the [LICENSE](LICENSE) file for details.
