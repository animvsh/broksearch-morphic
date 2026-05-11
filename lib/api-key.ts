import { createHash, randomBytes } from 'crypto'

const SECRET_SALT =
  process.env.API_KEY_SALT || 'brok-default-salt-change-in-production'

export function generateApiKey(environment: 'live' | 'test' = 'live'): string {
  const prefix = `brok_sk_${environment}_`
  const randomPart = randomBytes(24).toString('base64url')
  return `${prefix}${randomPart}`
}

export function hashApiKey(key: string): string {
  return createHash('sha256')
    .update(key + SECRET_SALT)
    .digest('hex')
}

export function verifyApiKey(key: string, hash: string): boolean {
  return hashApiKey(key) === hash
}

export function maskApiKey(key: string): string {
  if (key.length < 12) return '••••••••••••'
  const prefix = key.slice(0, 12)
  const suffix = key.slice(-4)
  return `${prefix}••••••••${suffix}`
}

export function getKeyPrefix(key: string): string {
  if (key.length < 8) return key
  return key.slice(0, 12)
}
