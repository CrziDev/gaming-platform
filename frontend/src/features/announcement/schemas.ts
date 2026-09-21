import { z } from 'zod'

export const announcementSchema = z
  .object({
    text: z
      .string()
      .trim()
      .min(1, 'Enter announcement text')
      .refine((value) => Array.from(value).length <= 280, 'Use at most 280 characters')
      .refine((value) => !/[\r\n]/.test(value), 'Use a single line'),
    duration: z.enum(['permanent', 'dated']),
    end_date: z.string(),
  })
  .superRefine((values, context) => {
    if (values.duration !== 'dated') return
    if (values.end_date === '') {
      context.addIssue({ code: 'custom', path: ['end_date'], message: 'Choose an end date' })
      return
    }
    if (endOfLocalDay(values.end_date).getTime() <= Date.now()) {
      context.addIssue({ code: 'custom', path: ['end_date'], message: 'Choose a future end date' })
    }
  })

export type AnnouncementFormInput = z.infer<typeof announcementSchema>

export function endOfLocalDay(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1, 23, 59, 59, 999)
}

export function localDateValue(iso: string): string {
  const value = new Date(iso)
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
