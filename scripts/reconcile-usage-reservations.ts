import { expireStaleUsageReservations } from '@/lib/brok/usage-tracker'

const DEFAULT_MAX_AGE_MINUTES = 60

function resolveMaxAgeMinutes() {
  const value = Number(process.env.USAGE_RESERVATION_MAX_AGE_MINUTES)
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_MAX_AGE_MINUTES
}

const maxAgeMinutes = resolveMaxAgeMinutes()
const before = new Date(Date.now() - maxAgeMinutes * 60 * 1000)
const expired = await expireStaleUsageReservations({ before })

console.log(
  JSON.stringify({
    ok: true,
    expired,
    maxAgeMinutes,
    before: before.toISOString()
  })
)
