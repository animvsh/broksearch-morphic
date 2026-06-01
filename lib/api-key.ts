import { createHash, randomBytes, timingSafeEqual } from 'crypto'

const ENV_SALT = process.env.API_KEY_SALT

if (!ENV_SALT && process.env.NODE_ENV === 'production' && process.env.BROK_CLOUD_DEPLOYMENT === 'true') {
  throw new Error(
    '[brok-auth] API_KEY_SALT is not set. Refusing to start in production with a default API key salt.'
  )
}

const SECRET_SALT = ENV_SALT || 'brok-default-salt-change-in-production'

if (!ENV_SALT && process.env.NODE_ENV !== 'test') {
  console.warn(
    '[brok-auth] API_KEY_SALT is not set; using a development default. Set API_KEY_SALT in any non-test environment.'
  )
}

export interface HashedApiKey {
  hash: string
  salt: string
}

export function generateApiKey(environment: 'live' | 'test' = 'live'): string {
  const prefix = `brok_sk_${environment}_`
  const randomPart = randomBytes(24).toString('base64url')
  return `${prefix}${randomPart}`
}

export function generateKeySalt(): string {
  return randomBytes(16).toString('base64url')
}

export function hashApiKey(key: string, keySalt?: string | null): string {
  if (keySalt) {
    return createHash('sha256')
      .update(key + keySalt + SECRET_SALT)
      .digest('hex')
  }
  return createHash('sha256')
    .update(key + SECRET_SALT)
    .digest('hex')
}

export function hashNewApiKey(key: string): HashedApiKey {
  const salt = generateKeySalt()
  return { hash: hashApiKey(key, salt), salt }
}

export function verifyApiKey(
  key: string,
  hash: string,
  keySalt?: string | null
): boolean {
  const computed = Buffer.from(hashApiKey(key, keySalt), 'hex')
  const stored = Buffer.from(hash, 'hex')
  if (computed.length !== stored.length) return false
  return timingSafeEqual(computed, stored)
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
