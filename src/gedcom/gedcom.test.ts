import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { formatDate, formatYear, parseDate } from './date'
import { buildTree, parents, siblings } from './model'
import { parseGedcom } from './parse'
import { allRelations, brickWalls, relationTo } from './relationship'

const sample = readFileSync(new URL('../../public/exemple.ged', import.meta.url), 'utf8')

describe('parseGedcom', () => {
  it('nests lines by level and folds CONT/CONC', () => {
    const [rec] = parseGedcom('0 @N1@ NOTE Une note\r\n1 CONC  longue\n1 CONT seconde ligne\n')
    expect(rec.xref).toBe('N1')
    expect(rec.value).toBe('Une note longue\nseconde ligne')
  })

  it('keeps sub-records under their parent', () => {
    const [indi] = parseGedcom('0 @I1@ INDI\n1 BIRT\n2 DATE 1900\n2 PLAC Paris\n1 SEX M')
    expect(indi.children.map((c) => c.tag)).toEqual(['BIRT', 'SEX'])
    expect(indi.children[0].children.map((c) => c.value)).toEqual(['1900', 'Paris'])
  })
})

describe('dates', () => {
  it.each([
    ['22 NOV 2003', '22 nov. 2003', '2003'],
    ['ABT 1650', 'vers 1650', '~1650'],
    ['BEF 18 NOV 1972', 'avant 18 nov. 1972', 'av. 1972'],
    ['AFT 1700', 'après 1700', 'ap. 1700'],
    ['BET 1870 AND 1875', 'entre 1870 et 1875', '1870/75'],
    ['FEB 1900', 'févr. 1900', '1900'],
    ['1 JAN 1901', '1er janv. 1901', '1901'],
  ])('%s', (raw, full, year) => {
    const d = parseDate(raw)
    expect(formatDate(d)).toBe(full)
    expect(formatYear(d)).toBe(year)
  })

  it('keeps unreadable dates as a phrase', () => {
    const d = parseDate('(pendant la guerre)')
    expect(d?.start).toBeUndefined()
    expect(formatDate(d)).toBe('pendant la guerre')
  })
})

describe('buildTree', () => {
  const tree = buildTree(sample)

  it('reads people, families and names', () => {
    expect(tree.persons.size).toBe(29)
    expect(tree.persons.get('I1')).toMatchObject({ given: 'Lucie Anne', surname: 'MOREL', sex: 'F' })
    expect(tree.persons.get('I28')).toMatchObject({ given: '', surname: 'GIRAUD' })
    expect(tree.order[0]).toBe('I1')
  })

  it('links parents and siblings, including half-siblings', () => {
    const { father, mother } = parents(tree, 'I1')
    expect(father?.id).toBe('I2')
    expect(mother?.id).toBe('I3')
    expect(siblings(tree, 'I1').map((s) => [s.person.id, s.half])).toEqual([['I4', false], ['I6', true]])
  })

  it('infers who is deceased', () => {
    expect(tree.persons.get('I7')?.deceased).toBe(true)
    expect(tree.persons.get('I1')?.deceased).toBe(false)
    expect(tree.persons.get('I25')?.deceased).toBe(true)
  })

  it('rebuilds missing back-links', () => {
    const t = buildTree('0 @I1@ INDI\n1 NAME A /B/\n0 @I2@ INDI\n1 NAME C /B/\n0 @F1@ FAM\n1 HUSB @I1@\n1 CHIL @I2@')
    expect(t.persons.get('I1')?.fams).toEqual(['F1'])
    expect(parents(t, 'I2').father?.id).toBe('I1')
  })
})

describe('relationships', () => {
  const tree = buildTree(sample)
  const rel = (id: string) => relationTo(tree, 'I1', id)

  it.each([
    ['I1', 'Personne de référence', 'self'],
    ['I2', 'Père', 'paternal'],
    ['I13', 'Grand-mère', 'maternal'],
    ['I14', 'Arrière-grand-père', 'paternal'],
    ['I21', 'Arrière-arrière-grand-père', 'paternal'],
    ['I4', 'Frère', 'both'],
    ['I6', 'Demi-sœur', 'paternal'],
    ['I9', 'Tante', 'paternal'],
    ['I11', 'Cousin germain', 'paternal'],
    ['I29', 'Grand-oncle', 'paternal'],
    ['I5', 'Belle-mère', 'alliance'],
    ['I10', 'Oncle par alliance', 'alliance'],
  ])('%s → %s', (id, label, side) => {
    const r = rel(id)
    expect(r.label).toBe(label)
    expect(r.side).toBe(side)
  })

  it('computes everyone at once', () => {
    const all = allRelations(tree, 'I1')
    expect(all.size).toBe(tree.persons.size)
    expect(all.get('I27')?.label).toBe('Ancêtre (6ᵉ génération)')
  })

  it('lists brick walls on the direct line', () => {
    const walls = brickWalls(tree, 'I1').map((w) => [w.person.id, w.missing])
    expect(walls).toContainEqual(['I18', 'both'])
    expect(walls).toContainEqual(['I12', 'mother'])
    expect(walls).not.toContainEqual(['I2', 'both'])
  })
})
