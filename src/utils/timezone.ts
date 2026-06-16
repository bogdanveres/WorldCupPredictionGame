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

// Game day boundary: 10:00 Romania time. Matches before 10:00 belong to the previous game day.
// e.g. kickoff 01:00 / 04:00 / 07:00 Romania → grouped under previous calendar date.
const GAME_DAY_BOUNDARY_HOURS = 10

export function romaniaGameDateStr(utcIso: string): string {
  const romaniaMs = toRomaniaTime(utcIso).getTime()
  const shifted = new Date(romaniaMs - GAME_DAY_BOUNDARY_HOURS * 3600_000)
  return format(toZonedTime(shifted, ROMANIA_TZ), 'yyyy-MM-dd')
}

export function todayRomaniaGameDateStr(): string {
  const nowRomaniaMs = toZonedTime(new Date(), ROMANIA_TZ).getTime()
  const shifted = new Date(nowRomaniaMs - GAME_DAY_BOUNDARY_HOURS * 3600_000)
  return format(toZonedTime(shifted, ROMANIA_TZ), 'yyyy-MM-dd')
}
