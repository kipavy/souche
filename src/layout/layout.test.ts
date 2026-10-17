import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildTree } from '../gedcom/model'
import { auditTree } from '../gedcom/quality'
import { fan, sosaMap } from './fan'
import { CARD_W, ROW, hourglass } from './hourglass'

const tree = buildTree(readFileSync(new URL('../../public/exemple.ged', import.meta.url), 'utf8'))

function overlaps(nodes: { x: number; y: number; key: string }[]) {
  const bad: string[] = []
  for (const a of nodes)
    for (const b of nodes)
      if (a.key < b.key && a.y === b.y && Math.abs(a.x - b.x) < CARD_W) bad.push(`${a.key}/${b.key}`)
  return bad
}

describe('hourglass', () => {
  it.each(['I1', 'I2', 'I7', 'I14', 'I27', 'I9'])('no two cards overlap around %s', (id) => {
    for (const up of [1, 3, 6]) for (const down of [0, 2, 5]) for (const uncles of [false, true]) {
      const { nodes } = hourglass(tree, id, { up, down, siblings: true, uncles })
      expect(overlaps(nodes)).toEqual([])
    }
  })

  it('shows uncles and aunts beside the parents, on the outer side', () => {
    const { nodes, links } = hourglass(tree, 'I1', { up: 2, down: 0, siblings: true, uncles: true })
    const at = (id: string) => nodes.find((n) => n.personId === id)!
    // I9 (Anne) is the sister of I2, the father of I1.
    expect(at('I9')).toMatchObject({ role: 'uncle', y: at('I2').y })
    expect(at('I9').x).toBeLessThan(at('I2').x)
    expect(links.some((l) => l.key.startsWith('parent:u:I2'))).toBe(true)
    // Off by default, and never without the grandparents' row.
    expect(hourglass(tree, 'I1', { up: 2, down: 0, siblings: true }).nodes.some((n) => n.role === 'uncle')).toBe(false)
    expect(hourglass(tree, 'I1', { up: 1, down: 0, siblings: true, uncles: true }).nodes.some((n) => n.role === 'uncle')).toBe(false)
  })

  it('places each generation exactly one row apart', () => {
    const { nodes } = hourglass(tree, 'I1', { up: 4, down: 0, siblings: true })
    const y = (id: string) => nodes.find((n) => n.personId === id)!.y
    expect([y('I1'), y('I2'), y('I7'), y('I14'), y('I21')]).toEqual([0, -ROW, -2 * ROW, -3 * ROW, -4 * ROW])
  })

  it('draws every link between rows, never past them', () => {
    const { links, bounds } = hourglass(tree, 'I1', { up: 4, down: 2, siblings: true })
    for (const l of links) for (const n of l.d.match(/-?\d+(\.\d+)?/g)!.map(Number)) expect(Number.isFinite(n)).toBe(true)
    const vs = links.flatMap((l) => [...l.d.matchAll(/V(-?[\d.]+)/g)].map((m) => +m[1]))
    expect(Math.min(...vs)).toBeGreaterThanOrEqual(bounds.minY)
  })

  it('puts parents above, children below, older siblings left', () => {
    const { nodes } = hourglass(tree, 'I2', { up: 2, down: 2, siblings: true })
    const at = (id: string) => nodes.find((n) => n.personId === id)!
    expect(at('I2')).toMatchObject({ x: 0, y: 0, role: 'focus' })
    expect(at('I7').y).toBeLessThan(0)
    expect(at('I1').y).toBeGreaterThan(0)
    expect(at('I9')).toMatchObject({ role: 'sibling' })
    expect(at('I9').x).toBeLessThan(0) // Anne (1965) is older than Thomas (1968)
    expect(nodes.filter((n) => n.role === 'spouse').map((n) => n.personId).sort()).toEqual(['I3', 'I5'])
  })

  it('shows a ghost for a single missing parent and flags hidden generations', () => {
    const { nodes } = hourglass(tree, 'I3', { up: 2, down: 0, siblings: false })
    expect(nodes.some((n) => n.role === 'ghost' && n.ghostLabel === 'Mère inconnue')).toBe(true)
    const top = hourglass(tree, 'I1', { up: 1, down: 0, siblings: false }).nodes.find((n) => n.personId === 'I2')
    expect(top?.moreUp).toBe(true)
  })
})

describe('fan', () => {
  it('numbers ancestors with Sosa', () => {
    const s = sosaMap(tree, 'I1')
    expect(s.get(2)).toBe('I2')
    expect(s.get(3)).toBe('I3')
    expect(s.get(4)).toBe('I7')
    expect(s.get(7)).toBe('I13')
  })

  it('draws known ancestors plus one ring of gaps', () => {
    const cells = fan(tree, 'I1', 6)
    expect(cells.find((c) => c.sosa === 2)?.personId).toBe('I2')
    expect(cells.filter((c) => c.gen === 1)).toHaveLength(2)
    expect(cells.every((c) => c.a1 > c.a0 && c.r1 > c.r0)).toBe(true)
  })
})

describe('audit', () => {
  it('catches a child born after the father died', () => {
    const issues = auditTree(tree)
    expect(issues.some((i) => i.personId === 'I29' && i.kind === 'incoherent')).toBe(true)
    expect(issues.some((i) => i.personId === 'I23' && i.kind === 'to-verify')).toBe(true)
    expect(issues.some((i) => i.personId === 'I28' && i.kind === 'no-given')).toBe(true)
  })
})
