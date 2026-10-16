import { parents, unions, type Person, type Sex, type Tree } from './model'

/** Which side of the reference person a relative belongs to. Drives colors everywhere. */
export type Side = 'self' | 'paternal' | 'maternal' | 'both' | 'descendant' | 'alliance' | 'none'

export interface Relation {
  label: string
  side: Side
  /** Civil degree (generations up + generations down); undefined for in-laws. */
  degree?: number
}

/** Ancestors of `id` with their generation distance, plus which parent branch led there. */
function ancestry(tree: Tree, id: string): Map<string, { gen: number; via?: 'F' | 'M' }> {
  const out = new Map<string, { gen: number; via?: 'F' | 'M' }>([[id, { gen: 0 }]])
  let frontier: [string, 'F' | 'M' | undefined][] = [[id, undefined]]
  for (let gen = 1; frontier.length; gen++) {
    const next: [string, 'F' | 'M' | undefined][] = []
    for (const [pid, via] of frontier) {
      const { father, mother } = parents(tree, pid)
      for (const [par, branch] of [[father, 'F'], [mother, 'M']] as const) {
        if (!par || out.has(par.id)) continue
        const v = via ?? branch
        out.set(par.id, { gen, via: v })
        next.push([par.id, v])
      }
    }
    frontier = next
  }
  return out
}

const g = (sex: Sex, m: string, f: string, u = m) => (sex === 'F' ? f : sex === 'M' ? m : u)
const arriere = (n: number) => 'arrière-'.repeat(Math.max(0, n))

function bloodLabel(up: number, down: number, sex: Sex, half: boolean): string {
  if (up === 0 && down === 0) return 'Personne de référence'
  if (down === 0) {
    if (up === 1) return g(sex, 'Père', 'Mère', 'Parent')
    if (up <= 5) return cap(arriere(up - 2) + g(sex, 'grand-père', 'grand-mère', 'grand-parent'))
    return `${g(sex, 'Ancêtre', 'Ancêtre')} (${up}ᵉ génération)`
  }
  if (up === 0) {
    if (down === 1) return g(sex, 'Fils', 'Fille', 'Enfant')
    if (down <= 5) return cap(arriere(down - 2) + g(sex, 'petit-fils', 'petite-fille', 'petit-enfant'))
    return `Descendant (${down}ᵉ génération)`
  }
  const demi = half ? 'demi-' : ''
  if (up === 1 && down === 1) return cap(demi + g(sex, 'frère', 'sœur', 'frère ou sœur'))
  if (up === 1) return cap(arriere(down - 3) + (down >= 3 ? g(sex, 'petit-neveu', 'petite-nièce') : g(sex, 'neveu', 'nièce')))
  if (down === 1) return cap(arriere(up - 3) + (up >= 3 ? g(sex, 'grand-oncle', 'grand-tante') : g(sex, 'oncle', 'tante')))
  if (up === down) {
    if (up === 2) return g(sex, 'Cousin germain', 'Cousine germaine')
    if (up === 3) return g(sex, 'Cousin issu de germain', 'Cousine issue de germain')
    if (up === 4) return g(sex, 'Cousin issu d’issu de germain', 'Cousine issue d’issu de germain')
  }
  if (up === 3 && down === 2) return g(sex, 'Oncle à la mode de Bretagne', 'Tante à la mode de Bretagne')
  if (up === 2 && down === 3) return g(sex, 'Neveu à la mode de Bretagne', 'Nièce à la mode de Bretagne')
  return g(sex, 'Cousin éloigné', 'Cousine éloignée')
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

interface Blood {
  up: number
  down: number
  half: boolean
  side: Side
}

function blood(tree: Tree, a: Map<string, { gen: number; via?: 'F' | 'M' }>, targetId: string): Blood | undefined {
  const b = ancestry(tree, targetId)
  let best: { up: number; down: number; ids: string[] } | undefined
  for (const [id, { gen: down }] of b) {
    const up = a.get(id)?.gen
    if (up === undefined) continue
    if (!best || up + down < best.up + best.down) best = { up, down, ids: [id] }
    else if (up + down === best.up + best.down && up === best.up) best.ids.push(id)
  }
  if (!best) return undefined
  // Only siblings get the "demi-" prefix: they're half when they don't come from the same family record.
  const refId = [...a].find(([, v]) => v.gen === 0)?.[0]
  const refFamc = new Set(tree.persons.get(refId ?? '')?.famc)
  const half = best.up === 1 && best.down === 1 && !tree.persons.get(targetId)?.famc.some((f) => refFamc.has(f))
  const vias = new Set(best.ids.map((id) => a.get(id)?.via))
  let side: Side = 'self'
  if (best.up === 0) side = best.down === 0 ? 'self' : 'descendant'
  else if (vias.has('F') && vias.has('M')) side = 'both'
  else side = vias.has('F') ? 'paternal' : 'maternal'
  return { ...best, half, side }
}

export function relationTo(tree: Tree, refId: string, targetId: string, cache?: Map<string, ReturnType<typeof ancestry>>): Relation {
  const target = tree.persons.get(targetId)
  if (!target || !tree.persons.has(refId)) return { label: '', side: 'none' }
  const anc = (id: string) => {
    let m = cache?.get(id)
    if (!m) {
      m = ancestry(tree, id)
      cache?.set(id, m)
    }
    return m
  }

  const direct = blood(tree, anc(refId), targetId)
  if (direct) {
    return { label: bloodLabel(direct.up, direct.down, target.sex, direct.half), side: direct.side, degree: direct.up + direct.down }
  }

  // Spouse of the reference person
  const refUnions = unions(tree, refId)
  if (refUnions.some((u) => u.spouse?.id === targetId)) return { label: g(target.sex, 'Conjoint', 'Conjointe'), side: 'alliance' }

  // Blood relative of a spouse: beau-père, beau-frère…
  for (const u of refUnions) {
    if (!u.spouse) continue
    const r = blood(tree, anc(u.spouse.id), targetId)
    if (!r) continue
    if (r.up === 1 && r.down === 0) return { label: g(target.sex, 'Beau-père', 'Belle-mère'), side: 'alliance' }
    if (r.up === 1 && r.down === 1) return { label: g(target.sex, 'Beau-frère', 'Belle-sœur'), side: 'alliance' }
    if (r.up === 0 && r.down === 1) return { label: g(target.sex, 'Beau-fils', 'Belle-fille'), side: 'alliance' }
    return { label: `Famille ${g(u.spouse.sex, 'du conjoint', 'de la conjointe')}`, side: 'alliance' }
  }

  // Spouse of a blood relative
  for (const u of unions(tree, targetId)) {
    if (!u.spouse) continue
    const r = blood(tree, anc(refId), u.spouse.id)
    if (!r) continue
    const s = target.sex
    let label: string
    if (r.up === 1 && r.down === 0) label = g(s, 'Beau-père', 'Belle-mère') // parent's partner
    else if (r.up === 0 && r.down === 1) label = g(s, 'Gendre', 'Belle-fille')
    else if (r.up === 1 && r.down === 1) label = g(s, 'Beau-frère', 'Belle-sœur')
    else if (r.up === 2 && r.down === 1) label = g(s, 'Oncle par alliance', 'Tante par alliance')
    else label = `Par alliance (${bloodLabel(r.up, r.down, u.spouse.sex, r.half).toLowerCase()})`
    return { label, side: 'alliance' }
  }

  return { label: 'Lien par alliance éloigné', side: 'alliance' }
}

/** Relations of everyone to the reference person, computed once per tree/reference. */
export function allRelations(tree: Tree, refId: string): Map<string, Relation> {
  const cache = new Map<string, ReturnType<typeof ancestry>>()
  const out = new Map<string, Relation>()
  const connected = connectedTo(tree, refId)
  for (const id of tree.persons.keys()) {
    out.set(id, connected.has(id) ? relationTo(tree, refId, id, cache) : { label: 'Sans lien connu', side: 'none' })
  }
  return out
}

/** Everyone reachable through any family link. */
export function connectedTo(tree: Tree, id: string): Set<string> {
  const seen = new Set<string>([id])
  const queue = [id]
  while (queue.length) {
    const p: Person | undefined = tree.persons.get(queue.pop()!)
    if (!p) continue
    for (const fid of [...p.famc, ...p.fams]) {
      const f = tree.families.get(fid)
      if (!f) continue
      for (const x of [f.husband, f.wife, ...f.children]) {
        if (x && !seen.has(x)) {
          seen.add(x)
          queue.push(x)
        }
      }
    }
  }
  return seen
}

/** Direct ancestors of `id` that have no known parents: where the research continues. */
export function brickWalls(tree: Tree, id: string): { person: Person; gen: number; missing: 'both' | 'father' | 'mother' }[] {
  const out: { person: Person; gen: number; missing: 'both' | 'father' | 'mother' }[] = []
  for (const [aid, { gen }] of ancestry(tree, id)) {
    const { father, mother } = parents(tree, aid)
    if (father && mother) continue
    out.push({ person: tree.persons.get(aid)!, gen, missing: !father && !mother ? 'both' : father ? 'mother' : 'father' })
  }
  return out.sort((a, b) => a.gen - b.gen)
}

export { ancestry }
