import { describe, expect, it } from 'vitest'
import { coupleInbreeding, consanguineousCouples, formatInbreeding, inbreeding, pairLabel } from './inbreeding'
import { buildTree } from './model'

/**
 * Builds a fictional tree from "child: father mother" lines. A name starting with "f" is a woman.
 * Every person gets an INDI record; a family is created per distinct couple.
 */
function tree(spec: string) {
  const people = new Set<string>()
  const couples = new Map<string, { father: string; mother: string; children: string[] }>()
  for (const line of spec.split('\n').filter((l) => l.trim())) {
    const [child, rest] = line.split(':').map((s) => s.trim())
    const [father, mother] = rest.split(/\s+/)
    for (const x of [child, father, mother]) people.add(x)
    const key = `${father}+${mother}`
    if (!couples.has(key)) couples.set(key, { father, mother, children: [] })
    couples.get(key)!.children.push(child)
  }
  const lines = ['0 HEAD']
  for (const p of people) lines.push(`0 @${p}@ INDI`, `1 NAME ${p} /TEST/`, `1 SEX ${p.startsWith('f') ? 'F' : 'M'}`)
  let n = 0
  for (const c of couples.values()) {
    lines.push(`0 @FAM${++n}@ FAM`, `1 HUSB @${c.father}@`, `1 WIFE @${c.mother}@`, ...c.children.map((ch) => `1 CHIL @${ch}@`))
  }
  lines.push('0 TRLR')
  return buildTree(lines.join('\n'))
}

// Grandparents g1 × fg2 have two children; their children marry each other.
const cousins = `
a: g1 fg2
fb: g1 fg2
p: a fx
fm: y fb
c: p fm
`

describe('inbreeding coefficient', () => {
  it('first cousins as parents → 1/16', () => {
    const t = tree(cousins)
    const ib = inbreeding(t, 'c')
    expect(ib.f).toBeCloseTo(1 / 16, 12)
    expect(ib.common).toHaveLength(1)
    expect(ib.common[0]).toMatchObject({ up: 2, down: 2, label: 'cousins germains' })
    expect(ib.common[0].ancestors.map((p) => p.id)).toEqual(['g1', 'fg2'])
    expect(ib.moreDistant).toBe(false)
    expect(formatInbreeding(ib.f)).toEqual({ percent: '6,25 %', fraction: '≈ 1/16' })
  })

  it('uncle and niece "à la mode de Bretagne" (2 and 3 generations) → 1/32', () => {
    const t = tree(`
a: g1 fg2
fb: g1 fg2
p: a fx
fd: y fb
fm: z fd
c: p fm
`)
    const ib = inbreeding(t, 'c')
    expect(ib.f).toBeCloseTo(1 / 32, 12)
    expect(ib.common[0]).toMatchObject({ up: 2, down: 3, label: 'oncle et nièce à la mode de Bretagne' })
    expect(formatInbreeding(ib.f)).toEqual({ percent: '3,13 %', fraction: '≈ 1/32' })
  })

  it('brother and sister as parents → 1/4', () => {
    const t = tree(`
p: g1 fg2
fm: g1 fg2
c: p fm
`)
    const ib = inbreeding(t, 'c')
    expect(ib.f).toBeCloseTo(1 / 4, 12)
    expect(ib.common[0].label).toBe('frère et sœur')
  })

  it('half-siblings → 1/8', () => {
    const t = tree(`
p: g1 fg2
fm: g1 fg3
c: p fm
`)
    const ib = inbreeding(t, 'c')
    expect(ib.f).toBeCloseTo(1 / 8, 12)
    expect(ib.common[0].label).toBe('demi-frère et demi-sœur')
  })

  it('unrelated parents → 0', () => {
    const t = tree(`
p: g1 fg2
fm: g3 fg4
c: p fm
`)
    expect(inbreeding(t, 'c')).toEqual({ f: 0, common: [], moreDistant: false })
    expect(consanguineousCouples(t)).toEqual([])
  })

  it('missing parent → 0', () => {
    const t = buildTree('0 @I1@ INDI\n0 @I2@ INDI\n0 @F1@ FAM\n1 HUSB @I1@\n1 CHIL @I2@')
    expect(inbreeding(t, 'I2').f).toBe(0)
  })

  it('weights by (1 + F) when the common ancestor is inbred', () => {
    // g1's parents are brother and sister (F(g1) = 1/4); g1 × fg2 are the common grandparents of c's parents.
    const t = tree(`
gs: aa fbb
fgs: aa fbb
g1: gs fgs
${cousins}
`)
    expect(inbreeding(t, 'g1').f).toBeCloseTo(1 / 4, 12)
    // (1/2)^5 × (1 + 1/4) through g1 + (1/2)^5 through fg2
    expect(inbreeding(t, 'c').f).toBeCloseTo((1 / 32) * (1 + 1 / 4) + 1 / 32, 12)
  })

  it('adds up several common couples, through both lines', () => {
    // Double first cousins: two brothers married two sisters.
    const t = tree(`
a: g1 fg2
b: g1 fg2
fa: g3 fg4
fb: g3 fg4
p: a fa
fm: b fb
c: p fm
`)
    const ib = inbreeding(t, 'c')
    expect(ib.f).toBeCloseTo(1 / 8, 12)
    expect(ib.common.map((x) => x.ancestors.map((p) => p.id))).toEqual([['g1', 'fg2'], ['g3', 'fg4']])
  })

  it('only lists the nearest common ancestors', () => {
    // The common grandparents' own parents are common ancestors too, but further up the same line.
    const t = tree(`
g1: gg1 fgg2
${cousins}
`)
    expect(inbreeding(t, 'c').common.flatMap((x) => x.ancestors.map((p) => p.id))).toEqual(['g1', 'fg2'])
    expect(inbreeding(t, 'c').moreDistant).toBe(false)
  })

  it('flags loops beyond the nearest common ancestors', () => {
    // fx (the father's mother) descends from gg, who is also g1's father: one more loop above g1.
    const t = tree(`
g1: gg fgg
h: gg fz
fx: h fh
${cousins}
`)
    const ib = inbreeding(t, 'c')
    // 1/16 through g1 × fg2, plus p → fx → h → gg ← g1 ← fb ← fm: (1/2)^7
    expect(ib.f).toBeCloseTo(1 / 16 + 1 / 128, 12)
    expect(ib.common.flatMap((x) => x.ancestors.map((p) => p.id))).toEqual(['g1', 'fg2'])
    expect(ib.moreDistant).toBe(true)
  })

  it('gives the couple figure for their children', () => {
    const t = tree(cousins)
    expect(coupleInbreeding(t, 'p', 'fm').f).toBeCloseTo(1 / 16, 12)
    const couples = consanguineousCouples(t)
    expect(couples.map((x) => [x.husband.id, x.wife.id])).toEqual([['p', 'fm']])
  })

  it('survives a loop in corrupted data', () => {
    const t = buildTree(
      '0 @I1@ INDI\n0 @I2@ INDI\n0 @I3@ INDI\n' +
        '0 @F1@ FAM\n1 HUSB @I2@\n1 WIFE @I3@\n1 CHIL @I1@\n' +
        '0 @F2@ FAM\n1 HUSB @I1@\n1 WIFE @I3@\n1 CHIL @I2@',
    )
    const f = inbreeding(t, 'I1').f
    expect(Number.isFinite(f)).toBe(true)
    expect(Number.isFinite(inbreeding(t, 'I2').f)).toBe(true)
    expect(() => consanguineousCouples(t)).not.toThrow()
  })

  it('handles a large collapsed pedigree quickly', () => {
    // 40 generations of 4 people, each generation's children marrying across the two families.
    const lines: string[] = []
    for (let gen = 1; gen <= 40; gen++) {
      const [m1, f1, m2, f2] = [`m${gen - 1}a`, `f${gen - 1}a`, `m${gen - 1}b`, `f${gen - 1}b`]
      lines.push(`m${gen}a: ${m1} ${f2}`, `f${gen}a: ${m2} ${f1}`, `m${gen}b: ${m1} ${f2}`, `f${gen}b: ${m2} ${f1}`)
    }
    const t = tree(lines.join('\n'))
    const start = performance.now()
    const f = inbreeding(t, 'm40a').f
    expect(f).toBeGreaterThan(0)
    expect(f).toBeLessThan(1)
    expect(performance.now() - start).toBeLessThan(1000)
  })
})

describe('pairLabel', () => {
  it.each([
    [1, 2, 'M', 'F', 'oncle et nièce'],
    [2, 1, 'M', 'F', 'tante et neveu'],
    [3, 2, 'M', 'F', 'tante et neveu à la mode de Bretagne'],
    [3, 3, 'M', 'F', 'cousins issus de germains'],
    [1, 3, 'M', 'F', 'grand-oncle et petite-nièce'],
    [4, 5, 'M', 'F', 'apparentés à 4 et 5 générations'],
    [0, 1, 'M', 'F', 'parent et enfant'],
    [3, 0, 'M', 'F', 'ascendant et descendant (3 générations)'],
  ] as const)('%i/%i', (up, down, a, b, label) => {
    expect(pairLabel(up, down, a, b)).toBe(label)
  })
})
