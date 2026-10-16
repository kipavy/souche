import { approxYear, formatYear } from './gedcom/date'
import type { Person } from './gedcom/model'
import type { Side } from './gedcom/relationship'

export const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

export const shortPlace = (place?: string) => place?.split(',')[0].trim() ?? ''

/** "1942 – 2019", "° 1998", "† 2019": the genealogist's shorthand. */
export function lifespan(p: Person | undefined): string {
  if (!p) return ''
  const b = p.birth?.date ? formatYear(p.birth.date) : ''
  const d = p.death?.date ? formatYear(p.death.date) : ''
  if (b && d) return `${b} – ${d}`
  if (b) return p.deceased ? `${b} – ?` : `° ${b}`
  if (d) return `† ${d}`
  return p.death ? '†' : ''
}

export function age(p: Person): number | undefined {
  const b = approxYear(p.birth?.date)
  if (b === undefined) return undefined
  const d = approxYear(p.death?.date)
  if (d !== undefined) return d - b
  if (p.deceased === false) return new Date().getFullYear() - b
  return undefined
}

export const SIDE_LABEL: Record<Side, string> = {
  self: 'Personne de référence',
  paternal: 'Côté paternel',
  maternal: 'Côté maternel',
  both: 'Fratrie',
  descendant: 'Descendance',
  alliance: 'Par alliance',
  none: 'Sans lien connu',
}

export const sideColor = (side: Side) =>
  side === 'paternal' ? 'var(--paternal)'
  : side === 'maternal' ? 'var(--maternal)'
  : side === 'descendant' ? 'var(--descendant)'
  : side === 'self' ? 'var(--ink)'
  : side === 'both' ? 'var(--paternal)'
  : 'var(--alliance)'

let ctx: CanvasRenderingContext2D | null = null
const widths = new Map<string, number>()

export function textWidth(text: string, font: string): number {
  const k = font + '|' + text
  let w = widths.get(k)
  if (w === undefined) {
    ctx ??= document.createElement('canvas').getContext('2d')
    if (!ctx) return text.length * 7
    ctx.font = font
    w = ctx.measureText(text).width
    widths.set(k, w)
  }
  return w
}

/** Truncates with an ellipsis so the text fits `max` pixels. */
export function fitText(text: string, font: string, max: number): string {
  if (textWidth(text, font) <= max) return text
  let lo = 0
  let hi = text.length
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (textWidth(text.slice(0, mid) + '…', font) <= max) lo = mid
    else hi = mid - 1
  }
  return text.slice(0, lo).trimEnd() + '…'
}

export const plural = (n: number, one: string, many: string) => `${n.toLocaleString('fr-FR')} ${n > 1 ? many : one}`
