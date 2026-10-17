import { parents, siblings, unions, type Tree } from '../gedcom/model'

export const CARD_W = 184
export const CARD_H = 66
const GAP = 22 // between unrelated cards
const COUPLE_GAP = 14 // between spouses
const GROUP_GAP = 40 // between children of different unions
export const ROW = CARD_H + 74

export type Role = 'focus' | 'ancestor' | 'descendant' | 'spouse' | 'sibling' | 'uncle' | 'ghost'

export interface LayoutNode {
  key: string
  personId?: string
  role: Role
  /** Card center */
  x: number
  y: number
  ghostLabel?: string
  half?: boolean
  moreUp?: boolean
  moreDown?: number
}

export interface LayoutLink {
  key: string
  d: string
  kind: 'parent' | 'couple' | 'half' | 'ghost'
}

export interface Layout {
  nodes: LayoutNode[]
  links: LayoutLink[]
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
}

export interface HourglassOptions {
  up: number
  down: number
  siblings: boolean
  /** Siblings of the focus's parents (uncles and aunts), beside them; needs `up` ≥ 2 to show the grandparents. */
  uncles?: boolean
}

interface Block {
  minX: number
  maxX: number
  nodes: LayoutNode[]
  links: LayoutLink[]
}

const shift = (b: Block, dx: number, dy: number): Block => ({
  minX: b.minX + dx,
  maxX: b.maxX + dx,
  nodes: b.nodes.map((n) => ({ ...n, x: n.x + dx, y: n.y + dy })),
  links: b.links.map((l) => ({ ...l, d: translatePath(l.d, dx, dy) })),
})

function translatePath(d: string, dx: number, dy: number): string {
  // Paths only use absolute M/H/V/L commands, so coordinates can be shifted per command.
  return d.replace(/([MLHV])\s*([-\d.]+)(?:[ ,]([-\d.]+))?/g, (_, cmd: string, a: string, b?: string) => {
    if (cmd === 'H') return `H${+a + dx}`
    if (cmd === 'V') return `V${+a + dy}`
    return `${cmd}${+a + dx} ${+b! + dy}`
  })
}

export function hourglass(tree: Tree, focusId: string, opts: HourglassOptions): Layout {
  const seen = new Map<string, number>()
  const keyFor = (personId: string) => {
    const n = (seen.get(personId) ?? 0) + 1
    seen.set(personId, n)
    return n === 1 ? personId : `${personId}#${n}`
  }

  // ---------- ancestors: blocks are relative to the child card center ----------
  function ancestors(id: string, gen: number, path: string): Block & { truncated: boolean } {
    const empty = { minX: -CARD_W / 2, maxX: CARD_W / 2, nodes: [], links: [] }
    const { father, mother } = parents(tree, id)
    if (!father && !mother) return { ...empty, truncated: false }
    if (gen > opts.up) return { ...empty, truncated: true }

    const side = (pid: string | undefined, tag: 'F' | 'M'): Block => {
      if (!pid) {
        const node: LayoutNode = { key: `ghost:${path}${tag}`, role: 'ghost', x: 0, y: 0, ghostLabel: tag === 'F' ? 'Père inconnu' : 'Mère inconnue' }
        return { minX: -CARD_W / 2, maxX: CARD_W / 2, nodes: [node], links: [] }
      }
      const above = ancestors(pid, gen + 1, path + tag)
      const node: LayoutNode = { key: keyFor(pid), personId: pid, role: 'ancestor', x: 0, y: 0, moreUp: above.truncated }
      // `above` is already positioned relative to this parent's card.
      const b = above
      const block = { minX: Math.min(-CARD_W / 2, b.minX), maxX: Math.max(CARD_W / 2, b.maxX), nodes: [node, ...b.nodes], links: b.links }
      return gen === 1 && opts.uncles && opts.up >= 2 ? withUncles(block, pid, tag === 'F' ? -1 : 1) : block
    }

    const fb = side(father?.id, 'F')
    const mb = side(mother?.id, 'M')
    // Father block ends just left of the axis, mother block starts just right of it.
    const f = shift(fb, -GAP / 2 - fb.maxX, -ROW)
    const m = shift(mb, GAP / 2 - mb.minX, -ROW)
    const fx = -GAP / 2 - fb.maxX
    const mx = GAP / 2 - mb.minX
    const ghostKind = !father || !mother
    const mid = (fx + mx) / 2
    const links: LayoutLink[] = [
      { key: `couple:a:${path}`, d: `M${fx + CARD_W / 2} ${-ROW}H${mx - CARD_W / 2}`, kind: ghostKind ? 'ghost' : 'couple' },
    ]
    if (gen > 1 || !opts.siblings) {
      links.push({ key: `parent:a:${path}`, d: `M${mid} ${-ROW}V${-ROW / 2}H0V${-CARD_H / 2}`, kind: 'parent' })
    }
    return {
      minX: f.minX,
      maxX: m.maxX,
      nodes: [...f.nodes, ...m.nodes],
      links: [...f.links, ...m.links, ...links],
      truncated: false,
    }
  }

  // ---------- uncles and aunts: the parent's siblings, on the outer side of the parent (dir -1 = left) ----------
  function withUncles(block: Block, parentId: string, dir: -1 | 1): Block {
    const sibs = siblings(tree, parentId) // sorted by birth
    if (!sibs.length) return block
    // Left side: oldest farthest out; right side: oldest nearest, so birth order reads left to right on both sides.
    const ordered = dir === -1 ? [...sibs].reverse() : sibs
    const nodes = [...block.nodes]
    const links = [...block.links]
    const full: number[] = []
    ordered.forEach((s, i) => {
      const x = dir * (i + 1) * (CARD_W + GAP)
      const moreDown = unions(tree, s.person.id).reduce((n, u) => n + u.children.length, 0) || undefined
      nodes.push({ key: keyFor(s.person.id), personId: s.person.id, role: 'uncle', x, y: 0, half: s.half, moreDown })
      if (s.half) links.push({ key: `half:u:${s.person.id}`, d: `M${x} ${-ROW / 2}V${-CARD_H / 2}`, kind: 'half' })
      else full.push(x)
    })
    if (full.length) {
      // Extend the grandparents' bus (drawn at mid-height down to the parent) to the full siblings.
      links.push({ key: `parent:u:${parentId}`, d: `M${Math.min(0, ...full)} ${-ROW / 2}H${Math.max(0, ...full)}`, kind: 'parent' })
      for (const x of full) links.push({ key: `parent:u:${parentId}:${x}`, d: `M${x} ${-ROW / 2}V${-CARD_H / 2}`, kind: 'parent' })
    }
    const far = dir * sibs.length * (CARD_W + GAP)
    return { minX: Math.min(block.minX, far - CARD_W / 2), maxX: Math.max(block.maxX, far + CARD_W / 2), nodes, links }
  }

  // ---------- descendants: blocks are relative to the person's card center ----------
  function descendants(id: string, depth: number, role: Role): Block {
    const us = unions(tree, id)
    const node: LayoutNode = { key: keyFor(id), personId: id, role, x: 0, y: 0 }
    const nodes: LayoutNode[] = [node]
    const links: LayoutLink[] = []

    // Spouse row: with several unions the first spouse goes left so two couples stay adjacent.
    const step = CARD_W + COUPLE_GAP
    const spouseX = us.map((_, i) => (us.length >= 2 ? (i === 0 ? -step : i * step) : step))
    let rowMin = -CARD_W / 2
    let rowMax = CARD_W / 2
    us.forEach((u, i) => {
      if (!u.spouse) return
      const x = spouseX[i]
      nodes.push({ key: keyFor(u.spouse.id), personId: u.spouse.id, role: 'spouse', x, y: 0 })
      rowMin = Math.min(rowMin, x - CARD_W / 2)
      rowMax = Math.max(rowMax, x + CARD_W / 2)
      const [a, b] = x < 0 ? [x + CARD_W / 2, -CARD_W / 2] : [CARD_W / 2, x - CARD_W / 2]
      // Spouses further than the adjacent slot get a line drawn under the cards in between.
      links.push({ key: `couple:d:${id}:${u.family.id}`, d: `M${a} 0H${b}`, kind: 'couple' })
    })

    const totalChildren = us.reduce((n, u) => n + u.children.length, 0)
    if (depth >= opts.down) {
      if (totalChildren) node.moreDown = totalChildren
      return { minX: rowMin, maxX: rowMax, nodes, links }
    }

    let minX = rowMin
    let maxX = rowMax
    let cursor = -Infinity
    // Process unions left to right by anchor so groups don't cross.
    const order = us.map((u, i) => ({ u, anchor: u.spouse ? spouseX[i] / 2 : 0 })).sort((a, b) => a.anchor - b.anchor)
    for (const { u, anchor } of order) {
      if (!u.children.length) continue
      const blocks = u.children.map((c) => descendants(c.id, depth + 1, 'descendant'))
      const width = blocks.reduce((w, b) => w + (b.maxX - b.minX), 0) + GAP * (blocks.length - 1)
      let left = Math.max(anchor - width / 2, cursor + GROUP_GAP)
      minX = Math.min(minX, left)
      cursor = left + width
      maxX = Math.max(maxX, cursor)
      const startY = u.spouse ? 0 : CARD_H / 2
      for (const b of blocks) {
        const placed = shift(b, left - b.minX, ROW)
        const child = placed.nodes[0]
        nodes.push(...placed.nodes)
        links.push(...placed.links)
        links.push({ key: `parent:d:${u.family.id}:${child.personId}`, d: `M${anchor} ${startY}V${ROW / 2}H${child.x}V${ROW - CARD_H / 2}`, kind: 'parent' })
        left += b.maxX - b.minX + GAP
      }
    }
    return { minX, maxX, nodes, links }
  }

  // ---------- assemble ----------
  const desc = descendants(focusId, 0, 'focus')
  const nodes = [...desc.nodes]
  const links = [...desc.links]

  // Row extents at y=0, to slot siblings around the focus and its spouses.
  const row0 = desc.nodes.filter((n) => n.y === 0)
  let left = Math.min(...row0.map((n) => n.x)) - CARD_W / 2
  let right = Math.max(...row0.map((n) => n.x)) + CARD_W / 2

  const anc = ancestors(focusId, 1, '')
  nodes.push(...anc.nodes)
  links.push(...anc.links)

  if (opts.siblings && opts.up >= 1) {
    const focus = tree.persons.get(focusId)
    const focusBirth = focus?.birth?.date?.start?.year
    const sibs = siblings(tree, focusId)
    const isOlder = (s: (typeof sibs)[number]) => {
      const y = s.person.birth?.date?.start?.year
      return focusBirth !== undefined && y !== undefined && y < focusBirth
    }
    // Older siblings fan out to the left (closest in age nearest), younger ones to the right.
    const ordered = [...sibs.filter(isOlder).reverse(), ...sibs.filter((s) => !isOlder(s))]
    const bus: number[] = [0]
    for (const s of ordered) {
      const goesLeft = isOlder(s)
      let x: number
      if (goesLeft) {
        x = left - GAP - CARD_W / 2
        left = x - CARD_W / 2
      } else {
        x = right + GAP + CARD_W / 2
        right = x + CARD_W / 2
      }
      nodes.push({ key: keyFor(s.person.id), personId: s.person.id, role: 'sibling', x, y: 0, half: s.half, moreDown: unions(tree, s.person.id).reduce((n, u) => n + u.children.length, 0) || undefined })
      if (s.half) links.push({ key: `half:${s.person.id}`, d: `M${x} ${-ROW / 2}V${-CARD_H / 2}`, kind: 'half' })
      else bus.push(x)
    }
    const coupleLink = anc.links.find((l) => l.key === 'couple:a:')
    if (coupleLink) {
      const fullSibs = bus.slice(1)
      const xs = [0, ...fullSibs]
      const halfXs = sibs.filter((s) => s.half).map((s) => nodes.find((n) => n.personId === s.person.id && n.role === 'sibling')!.x)
      const all = [...xs, ...halfXs]
      const { father, mother } = parents(tree, focusId)
      const fNode = anc.nodes.find((n) => n.personId === father?.id || n.key === 'ghost:F')
      const mNode = anc.nodes.find((n) => n.personId === mother?.id || n.key === 'ghost:M')
      const mid = fNode && mNode ? (fNode.x + mNode.x) / 2 : 0
      links.push({ key: 'parent:bus', d: `M${mid} ${-ROW}V${-ROW / 2}`, kind: 'parent' })
      links.push({ key: 'parent:bus:h', d: `M${Math.min(mid, ...all)} ${-ROW / 2}H${Math.max(mid, ...all)}`, kind: 'parent' })
      for (const x of xs) links.push({ key: `parent:bus:${x}`, d: `M${x} ${-ROW / 2}V${-CARD_H / 2}`, kind: 'parent' })
    }
  }

  const xs = nodes.map((n) => n.x)
  const ys = nodes.map((n) => n.y)
  return {
    nodes,
    links,
    bounds: {
      minX: Math.min(...xs) - CARD_W / 2,
      maxX: Math.max(...xs) + CARD_W / 2,
      minY: Math.min(...ys) - CARD_H / 2,
      maxY: Math.max(...ys) + CARD_H / 2,
    },
  }
}
