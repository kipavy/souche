import { approxYear, isUncertain } from './date'
import { fullName, parents, type Person, type Tree } from './model'

export type IssueKind = 'incoherent' | 'to-verify' | 'no-birth' | 'no-surname' | 'no-given'

export interface Issue {
  kind: IssueKind
  personId: string
  message: string
}

const VERIFY = /(à|a) (confirmer|vérifier|verifier|préciser|preciser|trouver)|probable|supposé|incertain|hypoth/i

export function auditTree(tree: Tree): Issue[] {
  const issues: Issue[] = []
  const year = (p: Person | undefined, which: 'birth' | 'death') => approxYear(p?.[which]?.date)

  for (const p of tree.persons.values()) {
    const by = year(p, 'birth')
    const dy = year(p, 'death')
    const add = (kind: IssueKind, message: string) => issues.push({ kind, personId: p.id, message })

    if (by !== undefined && dy !== undefined && dy < by) add('incoherent', `Décès (${dy}) avant la naissance (${by}).`)
    if (by !== undefined && dy !== undefined && dy - by > 110) add('incoherent', `Aurait vécu ${dy - by} ans.`)

    const { father, mother } = parents(tree, p.id)
    if (by !== undefined) {
      for (const [par, label] of [[father, 'du père'], [mother, 'de la mère']] as const) {
        const pb = year(par, 'birth')
        const pd = year(par, 'death')
        const who = label === 'du père' ? 'Le père' : 'La mère'
        if (pb !== undefined && by - pb < 0) add('incoherent', `Né${p.sex === 'F' ? 'e' : ''} en ${by}, avant ${who.toLowerCase()} (${pb}).`)
        else if (pb !== undefined && by - pb < 14) add('incoherent', `${who} n’avait que ${by - pb} ans à la naissance.`)
        if (pb !== undefined && label === 'de la mère' && by - pb > 55) add('incoherent', `Mère âgée de ${by - pb} ans à la naissance.`)
        // A father may die before the birth (posthumous child), but not more than a year before.
        const grace = label === 'du père' ? 1 : 0
        if (pd !== undefined && by > pd + grace) add('incoherent', `Né${p.sex === 'F' ? 'e' : ''} en ${by}, après le décès ${label} (${pd}).`)
      }
    }

    const notes = [...p.notes, ...p.events.flatMap((e) => e.notes)]
    const flagged = notes.find((n) => VERIFY.test(n))
    if (flagged) add('to-verify', flagged)

    if (!p.birth?.date?.start) add('no-birth', p.birth?.date ? `Date illisible : « ${p.birth.date.raw} »` : 'Aucune date de naissance.')
    if (!p.surname) add('no-surname', 'Nom de famille manquant.')
    if (!p.given) add('no-given', 'Prénom manquant.')
  }
  return issues
}

export interface Completeness {
  persons: number
  families: number
  withBirth: number
  withDeathWhenDeceased: number
  deceased: number
  withPlace: number
  uncertainDates: number
  sourced: number
  surnames: { surname: string; count: number }[]
  centuries: { century: number; count: number }[]
  span?: { from: number; to: number; earliest: string }
}

export function completeness(tree: Tree): Completeness {
  const people = [...tree.persons.values()]
  const surnames = new Map<string, number>()
  const centuries = new Map<number, number>()
  let earliest: Person | undefined
  for (const p of people) {
    if (p.surname) surnames.set(p.surname, (surnames.get(p.surname) ?? 0) + 1)
    const y = approxYear(p.birth?.date)
    if (y !== undefined) {
      const c = Math.floor(y / 100) + 1
      centuries.set(c, (centuries.get(c) ?? 0) + 1)
      if (!earliest || y < approxYear(earliest.birth?.date)!) earliest = p
    }
  }
  const years = people.map((p) => approxYear(p.birth?.date)).filter((y): y is number => y !== undefined)
  const deceased = people.filter((p) => p.deceased === true)
  return {
    persons: people.length,
    families: tree.families.size,
    withBirth: people.filter((p) => p.birth?.date?.start).length,
    deceased: deceased.length,
    withDeathWhenDeceased: deceased.filter((p) => p.death?.date?.start).length,
    withPlace: people.filter((p) => p.birth?.place).length,
    uncertainDates: people.filter((p) => isUncertain(p.birth?.date) || isUncertain(p.death?.date)).length,
    sourced: people.filter((p) => p.citations.length || p.events.some((e) => e.citations.length)).length,
    surnames: [...surnames].map(([surname, count]) => ({ surname, count })).sort((a, b) => b.count - a.count || a.surname.localeCompare(b.surname)),
    centuries: [...centuries].map(([century, count]) => ({ century, count })).sort((a, b) => a.century - b.century),
    span: years.length ? { from: Math.min(...years), to: Math.max(...years), earliest: fullName(earliest) } : undefined,
  }
}
