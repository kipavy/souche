export interface DatePoint {
  year: number
  month?: number
  day?: number
}

export type Qualifier = 'exact' | 'about' | 'estimated' | 'calculated' | 'before' | 'after' | 'between' | 'from' | 'to' | 'period'

export interface GedDate {
  raw: string
  qualifier: Qualifier
  start?: DatePoint
  end?: DatePoint
  /** Free text when the date could not be read (or the INT phrase). */
  phrase?: string
}

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
  // French spellings, sometimes found in hand-written files
  JANV: 1, FEV: 2, FEVR: 2, MARS: 3, AVR: 4, AVRIL: 4, MAI: 5, JUIN: 6, JUIL: 7, AOU: 8, AOUT: 8, SEPT: 9, NOVE: 11,
}

const MONTH_FR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

function parsePoint(s: string): DatePoint | undefined {
  const tokens = s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\./g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!tokens.length) return undefined

  const yearTok = tokens[tokens.length - 1].replace(/\/\d+$/, '') // dual years: 1700/01
  if (!/^\d{1,4}$/.test(yearTok)) return undefined
  const point: DatePoint = { year: Number(yearTok) }

  if (tokens.length >= 2) {
    const month = MONTHS[tokens[tokens.length - 2]]
    if (!month) return undefined
    point.month = month
  }
  if (tokens.length >= 3) {
    const day = Number(tokens[tokens.length - 3])
    if (!Number.isInteger(day) || day < 1 || day > 31) return undefined
    point.day = day
  }
  return tokens.length <= 3 ? point : undefined
}

export function parseDate(raw: string): GedDate | undefined {
  const text = raw.trim()
  if (!text) return undefined
  const up = text.toUpperCase()

  const range = /^BET\s+(.+?)\s+AND\s+(.+)$/.exec(up)
  if (range) return withPoints(text, 'between', range[1], range[2])

  const period = /^FROM\s+(.+?)\s+TO\s+(.+)$/.exec(up)
  if (period) return withPoints(text, 'period', period[1], period[2])

  const interp = /^INT\s+(.+?)\s*\((.*)\)$/.exec(text)
  if (interp) {
    const start = parsePoint(interp[1])
    return start ? { raw: text, qualifier: 'exact', start, phrase: interp[2] } : { raw: text, qualifier: 'exact', phrase: text }
  }

  const prefixes: [string, Qualifier][] = [
    ['ABT', 'about'], ['ABOUT', 'about'], ['CIRCA', 'about'], ['CA', 'about'], ['VERS', 'about'],
    ['EST', 'estimated'], ['CAL', 'calculated'],
    ['BEF', 'before'], ['AVANT', 'before'], ['AFT', 'after'], ['APRES', 'after'],
    ['FROM', 'from'], ['TO', 'to'],
  ]
  for (const [word, qualifier] of prefixes) {
    if (up.startsWith(word + ' ') || up.startsWith(word + '.')) {
      const start = parsePoint(text.slice(word.length + 1))
      return start ? { raw: text, qualifier, start } : { raw: text, qualifier: 'exact', phrase: text }
    }
  }

  const start = parsePoint(text)
  return start ? { raw: text, qualifier: 'exact', start } : { raw: text, qualifier: 'exact', phrase: text.replace(/^\((.*)\)$/, '$1') }
}

function withPoints(raw: string, qualifier: Qualifier, a: string, b: string): GedDate {
  const start = parsePoint(a)
  const end = parsePoint(b)
  if (!start || !end) return { raw, qualifier: 'exact', phrase: raw }
  return { raw, qualifier, start, end }
}

/** Comparable number, or undefined when the date has no usable year. */
export function sortKey(d: GedDate | undefined): number | undefined {
  const p = d?.start
  if (!p) return undefined
  return p.year * 10000 + (p.month ?? 0) * 100 + (p.day ?? 0)
}

/** Best guess year for placing on a time axis. */
export function approxYear(d: GedDate | undefined): number | undefined {
  if (!d?.start) return undefined
  if (d.qualifier === 'between' && d.end) return Math.round((d.start.year + d.end.year) / 2)
  return d.start.year
}

export const isUncertain = (d: GedDate | undefined) => !!d && d.qualifier !== 'exact'

function formatPoint(p: DatePoint): string {
  if (p.day && p.month) return `${p.day === 1 ? '1er' : p.day} ${MONTH_FR[p.month - 1]} ${p.year}`
  if (p.month) return `${MONTH_FR[p.month - 1]} ${p.year}`
  return String(p.year)
}

/** Full French rendering: "vers 1650", "22 nov. 2003", "entre 1650 et 1660". */
export function formatDate(d: GedDate | undefined): string {
  if (!d) return ''
  if (!d.start) return d.phrase ?? d.raw
  const s = formatPoint(d.start)
  switch (d.qualifier) {
    case 'about': return `vers ${s}`
    case 'estimated': return `estimé ${s}`
    case 'calculated': return `calculé ${s}`
    case 'before': return `avant ${s}`
    case 'after': return `après ${s}`
    case 'from': return `depuis ${s}`
    case 'to': return `jusqu’en ${s}`
    case 'between': return `entre ${s} et ${formatPoint(d.end!)}`
    case 'period': return `de ${s} à ${formatPoint(d.end!)}`
    default: return s
  }
}

/** Compact year for cards: "1942", "~1650", "av. 1700", "1650-60". */
export function formatYear(d: GedDate | undefined): string {
  if (!d?.start) return d ? '?' : ''
  const y = d.start.year
  switch (d.qualifier) {
    case 'about':
    case 'estimated':
    case 'calculated': return `~${y}`
    case 'before': return `av. ${y}`
    case 'after': return `ap. ${y}`
    case 'between':
    case 'period': {
      // 1870/75 rather than 1870–1875, which reads as a lifespan on cards
      const e = d.end!.year
      return Math.floor(e / 100) === Math.floor(y / 100) ? `${y}/${String(e).slice(-2)}` : `${y}/${e}`
    }
    default: return String(y)
  }
}
