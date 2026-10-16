import { parents, type Tree } from '../gedcom/model'

export interface FanCell {
  key: string
  sosa: number
  personId?: string
  gen: number
  a0: number
  a1: number
  r0: number
  r1: number
  /** Branch from the center person: father's side or mother's side */
  side: 'self' | 'paternal' | 'maternal'
}

export const FAN_SPAN = (2 * Math.PI * 240) / 360
export const CENTER_R = 74

/** Rings near the center are short and wide (names written across); outer rings are long and narrow (names written along the radius). */
export function ringWidth(gen: number): number {
  if (gen <= 3) return 72
  if (gen === 4) return 104
  return 122
}

export function ringInner(gen: number): number {
  let r = CENTER_R
  for (let g = 1; g < gen; g++) r += ringWidth(g)
  return r
}

/** Sosa-Stradonitz numbering: 1 = person, 2n = father of n, 2n+1 = mother of n. */
export function sosaMap(tree: Tree, rootId: string, maxGen = 30): Map<number, string> {
  const out = new Map<number, string>([[1, rootId]])
  let frontier = [1]
  for (let gen = 1; gen <= maxGen && frontier.length; gen++) {
    const next: number[] = []
    for (const n of frontier) {
      const { father, mother } = parents(tree, out.get(n)!)
      if (father) {
        out.set(2 * n, father.id)
        next.push(2 * n)
      }
      if (mother) {
        out.set(2 * n + 1, mother.id)
        next.push(2 * n + 1)
      }
    }
    frontier = next
  }
  return out
}

/** Every Sosa number of each ancestor (several when cousins married: implex). */
export function sosaByPerson(sosa: Map<number, string>): Map<string, number[]> {
  const out = new Map<string, number[]>()
  for (const [n, id] of sosa) out.set(id, [...(out.get(id) ?? []), n])
  return out
}

export function fan(tree: Tree, rootId: string, gens: number): FanCell[] {
  const sosa = sosaMap(tree, rootId, gens)
  const cells: FanCell[] = []
  for (let gen = 1; gen <= gens; gen++) {
    const count = 2 ** gen
    const step = FAN_SPAN / count
    const r0 = ringInner(gen)
    const r1 = r0 + ringWidth(gen)
    for (let i = 0; i < count; i++) {
      const n = count + i
      const childKnown = sosa.has(n >> 1)
      if (!childKnown) continue // only draw one empty ring beyond what is known
      cells.push({
        key: `s${n}`,
        sosa: n,
        personId: sosa.get(n),
        gen,
        a0: -FAN_SPAN / 2 + i * step,
        a1: -FAN_SPAN / 2 + (i + 1) * step,
        r0,
        r1,
        side: i < count / 2 ? 'paternal' : 'maternal',
      })
    }
  }
  return cells
}
