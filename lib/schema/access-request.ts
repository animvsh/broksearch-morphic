import * as z from 'zod'

export const accessRequestSchema = z.object({
  email: z
    .string()
    .trim()
    .pipe(z.email('Enter a valid email address.'))
    .transform(value => value.toLowerCase()),
  phoneNumber: z
    .string()
    .trim()
    .min(7, 'Enter a phone number admins can use to reach you.')
    .max(32, 'Enter a shorter phone number.')
    .refine(value => {
      const digits = value.replace(/\D/g, '')

      return digits.length >= 7 && digits.length <= 20
    }, 'Enter a valid phone number.')
})

export type AccessRequestInput = z.input<typeof accessRequestSchema>

export function normalizeAccessRequestPhone(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}
