import { format, parseISO } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'

const ROMANIA_TZ = 'Europe/Bucharest'

export function toRomaniaTime(utcIso: string): Date {
  return toZonedTime(parseISO(utcIso), ROMANIA_TZ)
}

export function formatRomaniaTime(utcIso: string, fmt = 'dd MMM yyyy, HH:mm'): string {
  return format(toRomaniaTime(utcIso), fmt)
}

export function formatKickoffDisplay(utcIso: string): string {
  return formatRomaniaTime(utcIso, 'EEE dd MMM, HH:mm')
}

export function isBeforeKickoff(scheduledKickoffUtc: string): boolean {
  return new Date() < new Date(scheduledKickoffUtc)
}

export function romaniaDateStr(utcIso: string): string {
  return format(toRomaniaTime(utcIso), 'yyyy-MM-dd')
}

export function todayRomaniaDateStr(): string {
  return format(toZonedTime(new Date(), ROMANIA_TZ), 'yyyy-MM-dd')
}
