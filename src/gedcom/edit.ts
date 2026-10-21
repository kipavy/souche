import { parseDate, type DatePoint } from './date'
import { child, children, parseGedcom, pointer, type GedNode } from './parse'
import type { Sex } from './model'

/*
 * Edits work on the GEDCOM records themselves, not on the Tree model, so every
 * tag Souche does not display (sources, media, custom _TAGs...) survives a save.
 */

// ---------- text <-> records ----------

const MAX_LINE = 200

/** Splits a long value into CONC chunks without cutting next to a space (CONC joins with no separator). */
function chunks(value: string): string[] {
  const out: string[] = []
  let rest = value
  while (rest.length > MAX_LINE) {
    let cut = MAX_LINE
    while (cut > 1 && (rest[cut - 1] === ' ' || rest[cut] === ' ')) cut--
    out.push(rest.slice(0, cut))
    rest = rest.slice(cut)
  }
  out.push(rest)
  return out
}

function writeNode(n: GedNode, level: number, out: string[]) {
  const head = `${level}${n.xref ? ` @${n.xref}@` : ''} ${n.tag}`
  n.value.split('\n').forEach((line, i) => {
    chunks(line).forEach((part, j) => {
      const prefix = i === 0 && j === 0 ? head : `${level + 1} ${j === 0 ? 'CONT' : 'CONC'}`
      out.push(part ? `${prefix} ${part}` : prefix)
    })
  })
  for (const c of n.children) writeNode(c, level + 1, out)
}

export function serializeGedcom(records: GedNode[]): string {
  const out: string[] = []
  for (const r of records) writeNode(r, 0, out)
  return out.join('\n') + '\n'
}

const node = (tag: string, value = '', kids: GedNode[] = []): GedNode => ({ level: 0, tag, value, children: kids })

/** Runs an edit on the parsed file and writes it back. */
export function editGedcom<T>(text: string, fn: (doc: GedDoc) => T): { text: string; result: T } {
  const doc = new GedDoc(parseGedcom(text))
  const result = fn(doc)
  return { text: doc.serialize(), result }
}

export function newGedcom(): string {
  const today = new Date()
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  return serializeGedcom([
    node('HEAD', '', [
      node('SOUR', 'SOUCHE', [node('NAME', 'Souche')]),
      node('DATE', `${today.getDate()} ${months[today.getMonth()]} ${today.getFullYear()}`),
      node('GEDC', '', [node('VERS', '5.5.1'), node('FORM', 'LINEAGE-LINKED')]),
      node('CHAR', 'UTF-8'),
      node('LANG', 'French'),
    ]),
    node('TRLR'),
  ])
}

// ---------- dates typed in French ----------

const MONTH_TAGS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

function pointToFrench(p: DatePoint): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  if (p.day && p.month) return `${pad(p.day)}/${pad(p.month)}/${p.year}`
  if (p.month) return `${pad(p.month)}/${p.year}`
  return String(p.year)
}

/** "17 JUN 1998" -> "17/06/1998", "ABT 1900" -> "vers 1900"; unreadable dates are shown as they are. */
export function dateToInput(raw: string | undefined): string {
  if (!raw) return ''
  const d = parseDate(raw)
  if (!d?.start) return raw
  const s = pointToFrench(d.start)
  switch (d.qualifier) {
    case 'exact': return s
    case 'about': return `vers ${s}`
    case 'before': return `avant ${s}`
    case 'after': return `après ${s}`
    case 'between': return `entre ${s} et ${pointToFrench(d.end!)}`
    default: return raw
  }
}

function frenchPoint(s: string): string | undefined {
  const m = /^(?:(\d{1,2})[/.-])?(?:(\d{1,2})[/.-])?(\d{3,4})$/.exec(s.trim())
  if (!m) return undefined
  // "06/1998" has its month in the first group
  const [day, month] = m[2] ? [Number(m[1]), Number(m[2])] : [undefined, m[1] ? Number(m[1]) : undefined]
  if (month !== undefined && (month < 1 || month > 12)) return undefined
  if (day !== undefined && (day < 1 || day > 31)) return undefined
  return [day, month && MONTH_TAGS[month - 1], m[3]].filter(Boolean).join(' ')
}

/** Accepts "17/06/1998", "06/1998", "1998", "vers 1900", "avant …", "après …", "entre … et …", or a GEDCOM date. */
export function inputToDate(input: string): string {
  const s = input.trim().replace(/\s+/g, ' ')
  if (!s) return ''
  const lower = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const between = /^entre (.+) et (.+)$/.exec(lower)
  if (between) {
    const a = frenchPoint(between[1])
    const b = frenchPoint(between[2])
    if (a && b) return `BET ${a} AND ${b}`
  }
  const prefixes: [RegExp, string][] = [[/^(vers|env\.?|environ|~) ?/, 'ABT '], [/^(avant|av\.?) /, 'BEF '], [/^(apres|ap\.?) /, 'AFT ']]
  for (const [re, tag] of prefixes) {
    if (re.test(lower)) {
      const p = frenchPoint(lower.replace(re, ''))
      if (p) return tag + p
    }
  }
  return frenchPoint(s) ?? s.toUpperCase()
}

// ---------- the document ----------

export interface EventForm {
  date: string
  place: string
}

export interface PersonForm {
  given: string
  surname: string
  sex: Sex
  birth: EventForm
  death: EventForm
  /** Only notes written on the record itself; shared NOTE records are left alone. */
  notes: string[]
}

export const emptyPerson = (sex: Sex = 'U'): PersonForm => ({
  given: '',
  surname: '',
  sex,
  birth: { date: '', place: '' },
  death: { date: '', place: '' },
  notes: [],
})

export class GedDoc {
  records: GedNode[]

  constructor(records: GedNode[]) {
    this.records = records
    if (!records.some((r) => r.tag === 'HEAD')) this.records.unshift(...parseGedcom(newGedcom()).filter((r) => r.tag === 'HEAD'))
    if (!records.some((r) => r.tag === 'TRLR')) this.records.push(node('TRLR'))
  }

  serialize(): string {
    // keep the trailer last whatever was added
    const trlr = this.records.filter((r) => r.tag === 'TRLR')
    return serializeGedcom([...this.records.filter((r) => r.tag !== 'TRLR'), ...trlr.slice(0, 1)])
  }

  get(id: string): GedNode | undefined {
    return this.records.find((r) => r.xref === id)
  }

  private newId(prefix: 'I' | 'F'): string {
    const taken = new Set(this.records.map((r) => r.xref).filter(Boolean))
    let max = 0
    for (const id of taken) {
      const m = new RegExp(`^${prefix}(\\d+)$`).exec(id!)
      if (m) max = Math.max(max, Number(m[1]))
    }
    let n = max + 1
    while (taken.has(`${prefix}${n}`)) n++
    return `${prefix}${n}`
  }

  private insert(rec: GedNode) {
    const at = this.records.findIndex((r) => r.tag === 'TRLR')
    this.records.splice(at < 0 ? this.records.length : at, 0, rec)
  }

  // ----- people -----

  readPerson(id: string): PersonForm {
    const r = this.get(id)
    const form = emptyPerson()
    if (!r) return form
    const name = child(r, 'NAME')
    if (name) {
      const m = /^([^/]*)\/([^/]*)\/?(.*)$/.exec(name.value)
      form.given = (child(name, 'GIVN')?.value ?? (m ? `${m[1]} ${m[3]}` : name.value)).trim().replace(/\s+/g, ' ')
      form.surname = (child(name, 'SURN')?.value ?? m?.[2] ?? '').trim()
    }
    const sex = child(r, 'SEX')?.value.trim().toUpperCase()
    form.sex = sex === 'M' || sex === 'F' ? sex : 'U'
    for (const [key, tag] of [['birth', 'BIRT'], ['death', 'DEAT']] as const) {
      const ev = child(r, tag)
      form[key] = { date: dateToInput(child(ev, 'DATE')?.value), place: child(ev, 'PLAC')?.value ?? '' }
    }
    form.notes = children(r, 'NOTE').filter((n) => !pointer(n.value)).map((n) => n.value)
    return form
  }

  writePerson(id: string, form: PersonForm) {
    const r = this.get(id)
    if (!r || r.tag !== 'INDI') return
    const given = form.given.trim().replace(/\s+/g, ' ')
    const surname = form.surname.trim().replace(/\s+/g, ' ')

    // NAME: rewrite the first name line, keep its other sub-tags (NICK, TYPE, SOUR...)
    let name = child(r, 'NAME')
    if (!name) {
      name = node('NAME')
      r.children.unshift(name)
    }
    name.value = `${given}${given ? ' ' : ''}/${surname}/`
    setChild(name, 'GIVN', given)
    setChild(name, 'SURN', surname)

    setChild(r, 'SEX', form.sex, nameIndex(r) + 1)
    this.writeEvent(r, 'BIRT', form.birth)
    this.writeEvent(r, 'DEAT', form.death)

    // inline notes: replace them in place, add or drop the extra ones
    const inline = r.children.filter((c) => c.tag === 'NOTE' && !pointer(c.value))
    const wanted = form.notes.map((n) => n.trim()).filter(Boolean)
    inline.forEach((n, i) => {
      if (i < wanted.length) n.value = wanted[i]
      else r.children.splice(r.children.indexOf(n), 1)
    })
    for (const text of wanted.slice(inline.length)) insertBeforeLinks(r, node('NOTE', text))
  }

  private writeEvent(r: GedNode, tag: string, ev: EventForm) {
    const date = inputToDate(ev.date)
    const place = ev.place.trim()
    let e = child(r, tag)
    if (!date && !place) {
      if (!e) return
      e.children = e.children.filter((c) => c.tag !== 'DATE' && c.tag !== 'PLAC')
      // a bare "1 DEAT" with nothing else is dropped; "1 DEAT Y" (known dead) is kept
      if (!e.children.length && !e.value) r.children.splice(r.children.indexOf(e), 1)
      return
    }
    if (!e) {
      e = node(tag)
      const after = tag === 'DEAT' ? child(r, 'BIRT') ?? child(r, 'SEX') : child(r, 'SEX')
      r.children.splice(after ? r.children.indexOf(after) + 1 : r.children.length, 0, e)
    }
    if (e.value.toUpperCase() === 'Y') e.value = ''
    setChild(e, 'DATE', date, 0)
    setChild(e, 'PLAC', place, child(e, 'DATE') ? 1 : 0)
  }

  addPerson(form: PersonForm = emptyPerson()): string {
    const id = this.newId('I')
    this.insert({ level: 0, xref: id, tag: 'INDI', value: '', children: [] })
    this.writePerson(id, form)
    return id
  }

  /** Removes the person and every link to them; families left with a single member go too. */
  deletePerson(id: string) {
    this.records = this.records.filter((r) => r.xref !== id)
    const gone = new Set<string>()
    for (const f of this.records.filter((r) => r.tag === 'FAM')) {
      f.children = f.children.filter((c) => !(['HUSB', 'WIFE', 'CHIL'].includes(c.tag) && pointer(c.value) === id))
      const members = f.children.filter((c) => ['HUSB', 'WIFE', 'CHIL'].includes(c.tag)).length
      if (members < 2 && f.xref) gone.add(f.xref)
    }
    this.records = this.records.filter((r) => !(r.xref && gone.has(r.xref)))
    for (const r of this.records.filter((r) => r.tag === 'INDI')) {
      r.children = r.children.filter((c) => !((c.tag === 'FAMC' || c.tag === 'FAMS') && gone.has(pointer(c.value) ?? '')))
    }
  }

  // ----- families -----

  private families(id: string, link: 'FAMC' | 'FAMS'): GedNode[] {
    const person = this.get(id)
    const ids = new Set(children(person, link).map((c) => pointer(c.value)))
    // links are sometimes stored on the family side only
    const role = link === 'FAMC' ? ['CHIL'] : ['HUSB', 'WIFE']
    for (const f of this.records) {
      if (f.tag === 'FAM' && f.children.some((c) => role.includes(c.tag) && pointer(c.value) === id)) ids.add(f.xref)
    }
    return this.records.filter((r) => r.tag === 'FAM' && r.xref && ids.has(r.xref))
  }

  private addFamily(spouses: string[], kids: string[]): string {
    const id = this.newId('F')
    const fam: GedNode = { level: 0, xref: id, tag: 'FAM', value: '', children: [] }
    for (const s of spouses) this.setSpouse(fam, s)
    for (const k of kids) this.addChildTo(fam, k)
    this.insert(fam)
    return id
  }

  private setSpouse(fam: GedNode, personId: string) {
    const person = this.get(personId)
    const sex = child(person, 'SEX')?.value.trim().toUpperCase()
    const hasHusb = !!child(fam, 'HUSB')
    const tag = sex === 'F' || (sex !== 'M' && hasHusb) ? 'WIFE' : 'HUSB'
    const at = tag === 'HUSB' ? 0 : fam.children.findIndex((c) => c.tag !== 'HUSB')
    fam.children.splice(at < 0 ? fam.children.length : at, 0, node(tag, `@${personId}@`))
    if (person) insertBeforeLinks(person, node('FAMS', `@${fam.xref}@`), true)
  }

  private addChildTo(fam: GedNode, kidId: string) {
    const last = fam.children.map((c) => c.tag).lastIndexOf('CHIL')
    const at = last >= 0 ? last + 1 : fam.children.filter((c) => c.tag === 'HUSB' || c.tag === 'WIFE').length
    fam.children.splice(at, 0, node('CHIL', `@${kidId}@`))
    const kid = this.get(kidId)
    if (kid) insertBeforeLinks(kid, node('FAMC', `@${fam.xref}@`), true)
  }

  /** Creates a father or mother for the person, in their existing parents' family when it has room. */
  addParent(childId: string, sex: 'M' | 'F', form?: PersonForm): string {
    const parentId = this.addPerson(form ?? emptyPerson(sex))
    const role = sex === 'M' ? 'HUSB' : 'WIFE'
    const fam = this.families(childId, 'FAMC').find((f) => !child(f, role))
    if (fam) this.setSpouse(fam, parentId)
    else this.addFamily([parentId], [childId])
    return parentId
  }

  /** Creates a partner, in the given union when it has room, else in a new one. */
  addSpouse(personId: string, familyId?: string, form?: PersonForm): string {
    const sex = child(this.get(personId), 'SEX')?.value.trim().toUpperCase()
    const spouseId = this.addPerson(form ?? emptyPerson(sex === 'M' ? 'F' : sex === 'F' ? 'M' : 'U'))
    // fill a single-parent union first rather than opening a second one
    const roomy = (f: GedNode) => !child(f, 'HUSB') || !child(f, 'WIFE')
    const target = familyId ? this.get(familyId) : undefined
    const lonely = target && roomy(target) ? target : this.families(personId, 'FAMS').find(roomy)
    if (lonely) this.setSpouse(lonely, spouseId)
    else this.addFamily([personId, spouseId], [])
    return spouseId
  }

  /** Creates a child in the given union, or in a single-parent family of the person. */
  addChild(parentId: string, familyId?: string, form?: PersonForm): string {
    const kidId = this.addPerson(form ?? emptyPerson())
    const fam = familyId ? this.get(familyId) : this.families(parentId, 'FAMS').find((f) => !child(f, 'HUSB') || !child(f, 'WIFE'))
    if (fam) this.addChildTo(fam, kidId)
    else this.addFamily([parentId], [kidId])
    // a surname is usually inherited from the father, else the parent we started from
    const father = pointer(child(fam ?? this.families(kidId, 'FAMC')[0], 'HUSB')?.value ?? '')
    const form2 = this.readPerson(kidId)
    if (!form2.surname) {
      form2.surname = this.readPerson(father ?? parentId).surname
      this.writePerson(kidId, form2)
    }
    return kidId
  }

  readMarriage(familyId: string): EventForm {
    const ev = child(this.get(familyId), 'MARR')
    return { date: dateToInput(child(ev, 'DATE')?.value), place: child(ev, 'PLAC')?.value ?? '' }
  }

  writeMarriage(familyId: string, ev: EventForm) {
    const f = this.get(familyId)
    if (f) this.writeEvent(f, 'MARR', ev)
  }
}

// ---------- small node helpers ----------

/** Sets, adds (at `at`) or removes a direct sub-tag depending on the value. */
function setChild(n: GedNode, tag: string, value: string, at?: number) {
  const existing = child(n, tag)
  if (!value) {
    if (existing) n.children.splice(n.children.indexOf(existing), 1)
    return
  }
  if (existing) existing.value = value
  else n.children.splice(at ?? n.children.length, 0, node(tag, value))
}

const nameIndex = (r: GedNode) => r.children.map((c) => c.tag).lastIndexOf('NAME')

/** Keeps FAMC/FAMS pointers at the end of a person, where GEDCOM writers usually put them. */
function insertBeforeLinks(r: GedNode, n: GedNode, isLink = false) {
  if (isLink) {
    if (r.children.some((c) => c.tag === n.tag && c.value === n.value)) return
    r.children.push(n)
    return
  }
  const first = r.children.findIndex((c) => c.tag === 'FAMC' || c.tag === 'FAMS')
  r.children.splice(first < 0 ? r.children.length : first, 0, n)
}
