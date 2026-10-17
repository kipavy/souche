import { parents, type Person, type Sex, type Tree } from './model'

/**
 * Wright's coefficient of inbreeding.
 *
 * F(X) = Σ over each common ancestor A of X's parents, and each pair of paths father → … → A and
 * mother → … → A sharing nobody but A, of (1/2)^(n1 + n2 + 1) × (1 + F(A)).
 *
 * Enumerating those paths blows up with pedigree collapse, so the same quantity is computed through
 * the kinship coefficient φ (F(X) = φ(father, mother)), with the classic recursion:
 *   φ(a, a) = (1 + F(a)) / 2
 *   φ(a, b) = (φ(father(a), b) + φ(mother(a), b)) / 2   when a is not an ancestor of b
 * Every pair is memoized per tree, and pairs with no common ancestor are cut short.
 */

export interface CommonAncestors {
  /** One person, or a couple when both spouses are common ancestors at the same distances. */
  ancestors: Person[]
  /** Generations from the first person (the father) up to the ancestor. */
  up: number
  /** Generations from the second person (the mother) up to the ancestor. */
  down: number
  /** "cousins germains", "oncle et nièce à la mode de Bretagne"… */
  label: string
}

export interface Inbreeding {
  f: number
  /** Nearest common ancestors of the two parents, closest first. Empty when f is 0. */
  common: CommonAncestors[]
  /** Part of f comes from loops further up than the nearest common ancestors. */
  moreDistant: boolean
}

const NONE: Inbreeding = { f: 0, common: [], moreDistant: false }

class Calculator {
  private depths = new Map<string, number>()
  private onStack = new Set<string>()
  private parentCache = new Map<string, string[]>()
  private ancestorSets = new Map<string, Set<string>>()
  private kinships = new Map<string, number>()
  private coefficients = new Map<string, number>()
  private tree: Tree

  constructor(tree: Tree) {
    this.tree = tree
  }

  private rawParents(id: string): string[] {
    const { father, mother } = parents(this.tree, id)
    return [father?.id, mother?.id].filter((x): x is string => !!x)
  }

  /** Generations above the person (0 for someone without known parents). A loop in corrupted data is cut where it closes. */
  private depth(id: string): number {
    const known = this.depths.get(id)
    if (known !== undefined) return known
    this.onStack.add(id)
    let d = 0
    for (const p of this.rawParents(id)) if (!this.onStack.has(p)) d = Math.max(d, this.depth(p) + 1)
    this.onStack.delete(id)
    this.depths.set(id, d)
    return d
  }

  /** Parents strictly older in the depth order: ancestry can't loop back on itself. */
  parentsOf(id: string): string[] {
    let ps = this.parentCache.get(id)
    if (!ps) {
      const d = this.depth(id)
      ps = this.rawParents(id).filter((p) => this.depth(p) < d)
      this.parentCache.set(id, ps)
    }
    return ps
  }

  /** The person and all their ancestors. */
  private ancestorsOf(id: string): Set<string> {
    let s = this.ancestorSets.get(id)
    if (!s) {
      s = new Set([id])
      const queue = [id]
      while (queue.length) {
        for (const p of this.parentsOf(queue.pop()!)) {
          if (!s.has(p)) {
            s.add(p)
            queue.push(p)
          }
        }
      }
      this.ancestorSets.set(id, s)
    }
    return s
  }

  private related(a: string, b: string): boolean {
    const [small, big] = [this.ancestorsOf(a), this.ancestorsOf(b)].sort((x, y) => x.size - y.size)
    for (const x of small) if (big.has(x)) return true
    return false
  }

  coefficient(id: string): number {
    let f = this.coefficients.get(id)
    if (f === undefined) {
      const ps = this.parentsOf(id)
      f = ps.length === 2 ? this.kinship(ps[0], ps[1]) : 0
      this.coefficients.set(id, f)
    }
    return f
  }

  kinship(a: string, b: string): number {
    if (a === b) return (1 + this.coefficient(a)) / 2
    const key = a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`
    let k = this.kinships.get(key)
    if (k === undefined) {
      if (!this.related(a, b)) k = 0
      else {
        // Climb from the younger one: it can't be an ancestor of the other.
        const [young, other] = this.depth(a) >= this.depth(b) ? [a, b] : [b, a]
        k = 0
        for (const p of this.parentsOf(young)) k += this.kinship(p, other) / 2
      }
      this.kinships.set(key, k)
    }
    return k
  }

  /** Common ancestors of a and b that aren't themselves ancestors of another common ancestor. */
  nearestCommon(a: string, b: string): { id: string; up: number; down: number }[] {
    const da = this.distances(a)
    const db = this.distances(b)
    const common = [...da.keys()].filter((id) => db.has(id))
    const hidden = new Set<string>()
    const queue = common.flatMap((id) => this.parentsOf(id))
    while (queue.length) {
      const id = queue.pop()!
      if (hidden.has(id)) continue
      hidden.add(id)
      queue.push(...this.parentsOf(id))
    }
    return common
      .filter((id) => !hidden.has(id))
      .map((id) => ({ id, up: da.get(id)!, down: db.get(id)! }))
      .sort((x, y) => x.up + x.down - (y.up + y.down) || x.up - y.up)
  }

  /** Shortest generation distance to each ancestor (the person included, at 0). */
  private distances(id: string): Map<string, number> {
    const out = new Map([[id, 0]])
    let frontier = [id]
    for (let gen = 1; frontier.length; gen++) {
      const next: string[] = []
      for (const x of frontier) {
        for (const p of this.parentsOf(x)) {
          if (out.has(p)) continue
          out.set(p, gen)
          next.push(p)
        }
      }
      frontier = next
    }
    return out
  }
}

const calculators = new WeakMap<Tree, Calculator>()
const calc = (tree: Tree) => {
  let c = calculators.get(tree)
  if (!c) {
    c = new Calculator(tree)
    calculators.set(tree, c)
  }
  return c
}

/** Inbreeding of a person: how related their two parents are. */
export function inbreeding(tree: Tree, id: string): Inbreeding {
  const ps = calc(tree).parentsOf(id)
  if (ps.length !== 2) return NONE
  return coupleInbreeding(tree, ps[0], ps[1])
}

/** Inbreeding the children of a and b would have (a is usually the father). */
export function coupleInbreeding(tree: Tree, a: string, b: string): Inbreeding {
  const c = calc(tree)
  if (!tree.persons.has(a) || !tree.persons.has(b) || a === b) return NONE
  const f = c.kinship(a, b)
  if (f <= 0) return NONE
  const pa = tree.persons.get(a)!
  const pb = tree.persons.get(b)!
  const nearest = c.nearestCommon(a, b)
  const used = new Set<string>()
  const common: CommonAncestors[] = []
  for (const n of nearest) {
    if (used.has(n.id)) continue
    used.add(n.id)
    const person = tree.persons.get(n.id)!
    const group = [person]
    // Fold a couple into one line when both spouses are there at the same distances.
    for (const fid of person.fams) {
      const fam = tree.families.get(fid)
      const sid = fam && (fam.husband === n.id ? fam.wife : fam.wife === n.id ? fam.husband : undefined)
      const spouse = sid && nearest.find((m) => m.id === sid && m.up === n.up && m.down === n.down && !used.has(m.id))
      if (spouse) {
        used.add(spouse.id)
        group.push(tree.persons.get(spouse.id)!)
        break
      }
    }
    if (group.length === 2 && group[0].sex === 'F' && group[1].sex !== 'F') group.reverse()
    common.push({ ancestors: group, up: n.up, down: n.down, label: pairLabel(n.up, n.down, pa.sex, pb.sex, group.length === 1) })
  }
  // Each nearest ancestor's own share through the shortest paths; anything beyond comes from further up.
  const direct = common.reduce((sum, x) => sum + x.ancestors.reduce((s2, anc) => s2 + 0.5 ** (x.up + x.down + 1) * (1 + c.coefficient(anc.id)), 0), 0)
  return { f, common, moreDistant: f - direct > 1e-12 }
}

/** Couples whose children are inbred, most related first. */
export function consanguineousCouples(tree: Tree): { familyId: string; husband: Person; wife: Person; inbreeding: Inbreeding }[] {
  const out: { familyId: string; husband: Person; wife: Person; inbreeding: Inbreeding }[] = []
  for (const fam of tree.families.values()) {
    const husband = fam.husband ? tree.persons.get(fam.husband) : undefined
    const wife = fam.wife ? tree.persons.get(fam.wife) : undefined
    if (!husband || !wife) continue
    const ib = coupleInbreeding(tree, husband.id, wife.id)
    if (ib.f > 0) out.push({ familyId: fam.id, husband, wife, inbreeding: ib })
  }
  return out.sort((x, y) => y.inbreeding.f - x.inbreeding.f)
}

const g = (sex: Sex, m: string, f: string) => (sex === 'F' ? f : m)

/** How two people relate through one common ancestor, as a pair: "cousins germains", "oncle et nièce"… */
export function pairLabel(up: number, down: number, sexA: Sex, sexB: Sex, half = false): string {
  if (up === 0 || down === 0) {
    const n = up + down
    if (n === 1) return 'parent et enfant'
    if (n === 2) return 'grand-parent et petit-enfant'
    return `ascendant et descendant (${n} générations)`
  }
  if (up === 1 && down === 1) {
    const demi = half ? 'demi-' : ''
    return sexA === sexB ? g(sexA, `${demi}frères`, `${demi}sœurs`) : `${demi}frère et ${demi}sœur`
  }
  if (up === down) {
    const plural = sexA === 'F' && sexB === 'F' ? 'cousines' : 'cousins'
    if (up === 2) return `${plural} germain${plural === 'cousines' ? 'es' : 's'}`
    if (up === 3) return `${plural} issu${plural === 'cousines' ? 'es' : 's'} de germains`
    if (up === 4) return `${plural} issu${plural === 'cousines' ? 'es' : 's'} d’issus de germains`
  }
  // The one closer to the common ancestor is the elder generation.
  const [eldSex, youngSex] = up < down ? [sexA, sexB] : [sexB, sexA]
  const near = Math.min(up, down)
  const far = Math.max(up, down)
  const pair = (oncle: string, tante: string, neveu: string, niece: string) => `${g(eldSex, oncle, tante)} et ${g(youngSex, neveu, niece)}`
  if (near === 1 && far === 2) return pair('oncle', 'tante', 'neveu', 'nièce')
  if (near === 1 && far === 3) return pair('grand-oncle', 'grand-tante', 'petit-neveu', 'petite-nièce')
  if (near === 2 && far === 3) return `${pair('oncle', 'tante', 'neveu', 'nièce')} à la mode de Bretagne`
  return `apparentés à ${up} et ${down} générations`
}

// Built by hand rather than with style: 'percent', whose space before % differs between ICU versions.
const DECIMAL = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const asPercent = (f: number) => `${DECIMAL.format(f * 100)} %`

/** "3,13 %" and "≈ 1/32". */
export function formatInbreeding(f: number): { percent: string; fraction: string } {
  const percent = f > 0 && f < 0.00005 ? `< ${asPercent(0.0001)}` : asPercent(f)
  const fraction = f > 0 ? `≈ 1/${Math.round(1 / f).toLocaleString('fr-FR')}` : '0'
  return { percent, fraction }
}
