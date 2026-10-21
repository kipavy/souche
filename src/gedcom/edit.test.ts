import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { dateToInput, editGedcom, emptyPerson, inputToDate, newGedcom } from './edit'
import { buildTree } from './model'
import { parseGedcom } from './parse'

const sample = readFileSync(new URL('../../public/exemple.ged', import.meta.url), 'utf8')

describe('dates typed in French', () => {
  it.each([
    ['17/06/1998', '17 JUN 1998'],
    ['06/1998', 'JUN 1998'],
    ['1998', '1998'],
    ['vers 1900', 'ABT 1900'],
    ['avant 18/11/1972', 'BEF 18 NOV 1972'],
    ['après 1700', 'AFT 1700'],
    ['entre 1870 et 1875', 'BET 1870 AND 1875'],
    ['ABT 1650', 'ABT 1650'],
  ])('%s -> %s', (input, ged) => {
    expect(inputToDate(input)).toBe(ged)
  })

  it.each(['17 JUN 1998', 'ABT 1900', 'BEF 18 NOV 1972', 'BET 1870 AND 1875', 'JUN 1998'])('%s survives the form', (ged) => {
    expect(inputToDate(dateToInput(ged))).toBe(ged)
  })
})

describe('editGedcom', () => {
  it('leaves an untouched file with the same content', () => {
    const before = buildTree(sample)
    const after = buildTree(editGedcom(sample, () => 0).text)
    expect([...after.persons.values()]).toEqual([...before.persons.values()])
    expect([...after.families.values()]).toEqual([...before.families.values()])
  })

  it('keeps tags it does not know about', () => {
    const text = '0 HEAD\n0 @I1@ INDI\n1 NAME Jean /DUPONT/\n1 _CUSTOM secret\n2 _SUB détail\n1 OBJE\n2 FILE photo.jpg\n0 TRLR\n'
    const out = editGedcom(text, (d) => d.writePerson('I1', { ...d.readPerson('I1'), given: 'Jean-Pierre' })).text
    expect(out).toContain('1 _CUSTOM secret\n2 _SUB détail')
    expect(out).toContain('2 FILE photo.jpg')
    expect(out).toContain('1 NAME Jean-Pierre /DUPONT/')
  })

  it('splits long and multi-line notes', () => {
    const long = 'mot '.repeat(80).trim()
    const out = editGedcom(newGedcom(), (d) => d.addPerson({ ...emptyPerson(), notes: [`${long}\nseconde ligne`] })).text
    expect(out).toMatch(/\n2 CONC /)
    expect(out).toContain('2 CONT seconde ligne')
    const [indi] = parseGedcom(out).filter((r) => r.tag === 'INDI')
    expect(indi.children.find((c) => c.tag === 'NOTE')!.value).toBe(`${long}\nseconde ligne`)
  })

  it('builds a family from scratch', () => {
    let { text, result: me } = editGedcom(newGedcom(), (d) =>
      d.addPerson({ ...emptyPerson('M'), given: 'Killian', surname: 'PAVY', birth: { date: '22/11/2003', place: 'Martigues' } }),
    )
    expect(buildTree(text).persons.get(me)!.birth?.date?.raw).toBe('22 NOV 2003')

    ;({ text } = editGedcom(text, (d) => {
      const father = d.addParent(me, 'M')
      d.writePerson(father, { ...d.readPerson(father), given: 'Ludovic', surname: 'PAVY' })
      d.addParent(me, 'F')
    }))
    let tree = buildTree(text)
    const [fam] = [...tree.families.values()]
    expect(tree.families.size).toBe(1)
    expect(fam.husband && fam.wife && fam.children).toEqual([me])

    let kid = ''
    ;({ text, result: kid } = editGedcom(text, (d) => d.addChild(me)))
    expect(buildTree(text).persons.get(kid)!.surname).toBe('PAVY')

    let spouse = ''
    ;({ text, result: spouse } = editGedcom(text, (d) => d.addSpouse(me)))
    tree = buildTree(text)
    expect(tree.persons.get(me)!.fams).toHaveLength(1)
    expect(tree.persons.get(spouse)!.sex).toBe('F')

    ;({ text } = editGedcom(text, (d) => d.deletePerson(spouse)))
    tree = buildTree(text)
    expect(tree.persons.has(spouse)).toBe(false)
    expect(tree.persons.get(me)!.fams).toHaveLength(1)

    // the union is now just one parent and nobody else once the child goes
    ;({ text } = editGedcom(text, (d) => d.deletePerson(kid)))
    tree = buildTree(text)
    expect(tree.persons.get(me)!.fams).toHaveLength(0)
    expect(tree.families.size).toBe(1)
  })

  it('removes an empty event but keeps a known death without date', () => {
    const text = '0 @I1@ INDI\n1 NAME A /B/\n1 BIRT\n2 DATE 1900\n1 DEAT Y\n0 TRLR\n'
    const out = editGedcom(text, (d) => d.writePerson('I1', { ...d.readPerson('I1'), birth: { date: '', place: '' } })).text
    expect(out).not.toContain('BIRT')
    expect(out).toContain('1 DEAT Y')
  })
})
