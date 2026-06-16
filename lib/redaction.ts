/**
 * Sensitive-key redactor used by admin log views to ensure raw API keys,
 * provider secrets, passwords, cookies, authorization headers, private
 * tokens, and OAuth credentials are never displayed in admin tooling.
 *
 * The redactor walks any JSON-serializable value, replacing sensitive
 * strings with `***REDACTED***` and truncating the visible prefix of any
 * key-like token (e.g. `brok_sk_live_…`) to the first safe segment.
 */

const REDACTED = '***REDACTED***'

const SENSITIVE_KEY_PATTERNS: RegExp[] = [
  /^api[_-]?key$/i,
  /^key$/i,
  /^secret$/i,
  /^client[_-]?secret$/i,
  /^password$/i,
  /^pass$/i,
  /^pwd$/i,
  /^cookie(s)?$/i,
  /^set[_-]?cookie$/i,
  /^authorization$/i,
  /^auth(orization)?$/i,
  /^proxy[_-]?authorization$/i,
  /^x[_-]?api[_-]?key$/i,
  /^x[_-]?auth[_-]?token$/i,
  /^x[_-]?secret$/i,
  /^private[_-]?token$/i,
  /^private[_-]?key$/i,
  /^access[_-]?token$/i,
  /^refresh[_-]?token$/i,
  /^id[_-]?token$/i,
  /^session[_-]?token$/i,
  /^bearer$/i,
  /^token$/i,
  /^credential(s)?$/i,
  /^oauth[_-]?token$/i,
  /^oauth[_-]?secret$/i,
  /^openai[_-]?api[_-]?key$/i,
  /^anthropic[_-]?api[_-]?key$/i,
  /^google[_-]?api[_-]?key$/i,
  /^provider[_-]?key$/i
]

const SECRET_VALUE_PATTERNS: RegExp[] = [
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key
  /\bAIza[0-9A-Za-z\-_]{35}\b/g, // Google API key
  /\bsk-[A-Za-z0-9]{20,}\b/g, // OpenAI/Anthropic style
  /\bsk_live_[A-Za-z0-9]{8,}\b/g, // brok live keys
  /\bsk_test_[A-Za-z0-9]{8,}\b/g,
  /\bghp_[A-Za-z0-9]{20,}\b/g, // GitHub tokens
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, // Slack
  /\bya29\.[0-9A-Za-z\-_]{20,}\b/g, // Google OAuth
  /Bearer\s+[A-Za-z0-9\-_.=]+/gi,
  /Basic\s+[A-Za-z0-9\-_.=]+/gi
]

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some(pattern => pattern.test(key))
}

function isKeyLikeValue(value: string): boolean {
  if (value.length < 20) return false
  return SECRET_VALUE_PATTERNS.some(pattern => pattern.test(value))
}

function maskKeyLikeValue(value: string): string {
  // Show the prefix up to the last alphanumeric cluster, mask the rest.
  const match = value.match(/^(brok_sk_(?:live|test)_[A-Za-z0-9]{0,8})/i)
  if (match) {
    return `${match[1]}${'•'.repeat(Math.max(value.length - match[1].length, 4))}`
  }
  if (value.length <= 12) return REDACTED
  return `${value.slice(0, 4)}${'•'.repeat(Math.max(value.length - 8, 6))}${value.slice(-4)}`
}

function redactString(value: string): string {
  let output = value
  for (const pattern of SECRET_VALUE_PATTERNS) {
    pattern.lastIndex = 0
    output = output.replace(pattern, substring => {
      // Preserve the first whitespace-separated token (e.g. "Bearer") for context.
      const spaceIndex = substring.search(/\s/)
      if (spaceIndex > 0) {
        return `${substring.slice(0, spaceIndex + 1)}${REDACTED}`
      }
      return REDACTED
    })
  }
  return output
}

function redactValue(value: unknown, parentKey?: string): unknown {
  if (value === null || value === undefined) return value

  if (typeof value === 'string') {
    if (parentKey && isSensitiveKey(parentKey)) {
      return isKeyLikeValue(value) ? maskKeyLikeValue(value) : REDACTED
    }
    if (isKeyLikeValue(value)) {
      return maskKeyLikeValue(value)
    }
    return redactString(value)
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  if (Array.isArray(value)) {
    return value.map(item => redactValue(item))
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    const redacted: Record<string, unknown> = {}
    for (const [key, inner] of entries) {
      redacted[key] = isSensitiveKey(key)
        ? typeof inner === 'string'
          ? REDACTED
          : REDACTED
        : redactValue(inner, key)
    }
    return redacted
  }

  return value
}

/**
 * Returns a deeply redacted copy of the provided value. Strings that match
 * known secret/token formats are masked; objects whose key looks sensitive
 * (e.g. "apiKey", "Authorization") have their value replaced entirely.
 */
export function redactSensitiveData<T>(value: T): T {
  return redactValue(value) as T
}

export const REDACTED_PLACEHOLDER = REDACTED
