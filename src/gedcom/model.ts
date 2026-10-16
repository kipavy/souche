import { approxYear, parseDate, sortKey, type GedDate } from './date'
import { child, children, parseGedcom, pointer, type GedNode } from './parse'

export type Sex = 'M' | 'F' | 'U'

export interface Citation {
  sourceId?: string
  page?: string
  text?: string
}

export interface LifeEvent {
  tag: string
  label: string
  date?: GedDate
  place?: string
  /** Value carried on the line itself, e.g. the job for OCCU. */
  value?: string
  notes: string[]
  citations: Citation[]
}

export interface Person {
  id: string
  given: string
  surname: string
  sex: Sex
  birth?: LifeEvent
  death?: LifeEvent
  events: LifeEvent[]
  famc: string[]
  fams: string[]
  notes: string[]
  citations: Citation[]
  /** true: known dead; false: presumed alive; undefined: can't tell */
  deceased?: boolean
}

export interface Family {
  id: string
  husband?: string
  wife?: string
  children: string[]
  events: LifeEvent[]
  notes: string[]
}

export interface Source {
  id: string
  title: string
  author?: string
  publication?: string
  text?: string
}

export interface Tree {
  persons: Map<string, Person>
  families: Map<string, Family>
  sources: Map<string, Source>
  /** Order of INDI records in the file; the first one is usually the author. */
  order: string[]
}

const EVENT_LABELS: Record<string, string> = {
  BIRT: 'Naissance', CHR: 'Baptême', BAPM: 'Baptême', DEAT: 'Décès', BURI: 'Inhumation', CREM: 'Crémation',
  OCCU: 'Profession', RESI: 'Résidence', EDUC: 'Études', GRAD: 'Diplôme', RETI: 'Retraite', EMIG: 'Émigration',
  IMMI: 'Immigration', NATU: 'Naturalisation', CENS: 'Recensement', PROB: 'Succession', WILL: 'Testament',
  ADOP: 'Adoption', CONF: 'Confirmation', FCOM: 'Communion', ORDN: 'Ordination', TITL: 'Titre', RELI: 'Religion',
  NATI: 'Nationalité', MILI: 'Service militaire', _MILT: 'Service militaire', EVEN: 'Événement', FACT: 'Fait',
  MARR: 'Mariage', DIV: 'Divorce', ENGA: 'Fiançailles', MARB: 'Bans', MARC: 'Contrat de mariage', MARL: 'Licence de mariage',
  ANUL: 'Annulation', DIVF: 'Demande de divorce', _PACS: 'PACS',
}

export const eventLabel = (tag: string) => EVENT_LABELS[tag] ?? tag

function readNotes(node: GedNode, noteRecords: Map<string, string>): string[] {
  return children(node, 'NOTE')
    .map((n) => {
      const ref = pointer(n.value)
      return ref ? (noteRecords.get(ref) ?? '') : n.value
    })
    .filter((s) => s.trim())
}

function readCitations(node: GedNode): Citation[] {
  return children(node, 'SOUR').map((s) => {
    const ref = pointer(s.value)
    const c: Citation = {}
    if (ref) c.sourceId = ref
    else if (s.value) c.text = s.value
    const page = child(s, 'PAGE')?.value
    if (page) c.page = page
    return c
  })
}

function readEvent(node: GedNode, noteRecords: Map<string, string>): LifeEvent {
  const typ = child(node, 'TYPE')?.value
  const dateRaw = child(node, 'DATE')?.value
  const ev: LifeEvent = {
    tag: node.tag,
    label: (node.tag === 'EVEN' || node.tag === 'FACT') && typ ? typ : eventLabel(node.tag),
    notes: readNotes(node, noteRecords),
    citations: readCitations(node),
  }
  if (dateRaw) ev.date = parseDate(dateRaw)
  const place = child(node, 'PLAC')?.value
  if (place) ev.place = place
  const v = node.value.trim()
  if (v && v.toUpperCase() !== 'Y') ev.value = v
  return ev
}

function readName(indi: GedNode): { given: string; surname: string } {
  const name = child(indi, 'NAME')
  if (!name) return { given: '', surname: '' }
  const m = /^([^/]*)\/([^/]*)\/?(.*)$/.exec(name.value)
  let given = m ? `${m[1]} ${m[3]}`.trim() : name.value.trim()
  let surname = m ? m[2].trim() : ''
  given = child(name, 'GIVN')?.value.trim() || given
  surname = child(name, 'SURN')?.value.trim() || surname
  return { given: given.replace(/\s+/g, ' '), surname }
}

const DEATH_TAGS = new Set(['DEAT', 'BURI', 'CREM', 'PROB'])
const PERSON_EVENT_TAGS = new Set(Object.keys(EVENT_LABELS).filter((t) => !['MARR', 'DIV', 'ENGA', 'MARB', 'MARC', 'MARL', 'ANUL', 'DIVF', '_PACS'].includes(t)))
const FAMILY_EVENT_TAGS = new Set(['MARR', 'DIV', 'ENGA', 'MARB', 'MARC', 'MARL', 'ANUL', 'DIVF', 'EVEN', 'RESI', 'CENS', '_PACS'])

export function buildTree(text: string): Tree {
  const records = parseGedcom(text)
  const noteRecords = new Map<string, string>()
  for (const r of records) if (r.tag === 'NOTE' && r.xref) noteRecords.set(r.xref, r.value)

  const tree: Tree = { persons: new Map(), families: new Map(), sources: new Map(), order: [] }

  for (const r of records) {
    if (!r.xref) continue
    if (r.tag === 'INDI') {
      const { given, surname } = readName(r)
      const sexRaw = child(r, 'SEX')?.value.trim().toUpperCase()
      const events = r.children.filter((c) => PERSON_EVENT_TAGS.has(c.tag)).map((c) => readEvent(c, noteRecords))
      const p: Person = {
        id: r.xref,
        given,
        surname,
        sex: sexRaw === 'M' || sexRaw === 'F' ? sexRaw : 'U',
        events,
        famc: children(r, 'FAMC').map((c) => pointer(c.value)).filter((x): x is string => !!x),
        fams: children(r, 'FAMS').map((c) => pointer(c.value)).filter((x): x is string => !!x),
        notes: readNotes(r, noteRecords),
        citations: readCitations(r),
      }
      p.birth = events.find((e) => e.tag === 'BIRT') ?? events.find((e) => e.tag === 'CHR' || e.tag === 'BAPM')
      p.death = events.find((e) => e.tag === 'DEAT') ?? events.find((e) => e.tag === 'BURI' || e.tag === 'CREM')
      tree.persons.set(p.id, p)
      tree.order.push(p.id)
    } else if (r.tag === 'FAM') {
      const f: Family = {
        id: r.xref,
        husband: pointer(child(r, 'HUSB')?.value ?? ''),
        wife: pointer(child(r, 'WIFE')?.value ?? ''),
        children: children(r, 'CHIL').map((c) => pointer(c.value)).filter((x): x is string => !!x),
        events: r.children.filter((c) => FAMILY_EVENT_TAGS.has(c.tag)).map((c) => readEvent(c, noteRecords)),
        notes: readNotes(r, noteRecords),
      }
      tree.families.set(f.id, f)
    } else if (r.tag === 'SOUR') {
      tree.sources.set(r.xref, {
        id: r.xref,
        title: child(r, 'TITL')?.value || child(r, 'ABBR')?.value || r.xref,
        author: child(r, 'AUTH')?.value,
        publication: child(r, 'PUBL')?.value,
        text: child(r, 'TEXT')?.value,
      })
    }
  }

  reconcileLinks(tree)
  for (const p of tree.persons.values()) {
    p.events.sort(byDate)
    for (const fid of p.fams) tree.families.get(fid)?.events.sort(byDate)
  }
  inferDeceased(tree)
  return tree
}

function byDate(a: LifeEvent, b: LifeEvent) {
  const ka = sortKey(a.date)
  const kb = sortKey(b.date)
  if (ka === undefined || kb === undefined) return 0
  return ka - kb
}

/** GEDCOM links are stored twice (FAMS/FAMC on people, HUSB/WIFE/CHIL on families); files often only have one side. */
function reconcileLinks(tree: Tree) {
  const add = (list: string[], id: string) => {
    if (!list.includes(id)) list.push(id)
  }
  for (const f of tree.families.values()) {
    for (const spouse of [f.husband, f.wife]) {
      const p = spouse ? tree.persons.get(spouse) : undefined
      if (p) add(p.fams, f.id)
    }
    f.children = f.children.filter((c) => tree.persons.has(c))
    for (const c of f.children) add(tree.persons.get(c)!.famc, f.id)
  }
  for (const p of tree.persons.values()) {
    p.famc = p.famc.filter((fid) => tree.families.has(fid))
    p.fams = p.fams.filter((fid) => tree.families.has(fid))
    for (const fid of p.famc) add(tree.families.get(fid)!.children, p.id)
    for (const fid of p.fams) {
      const f = tree.families.get(fid)!
      if (f.husband !== p.id && f.wife !== p.id) {
        if (!f.husband && p.sex !== 'F') f.husband = p.id
        else if (!f.wife) f.wife = p.id
      }
    }
  }
  for (const f of tree.families.values()) {
    f.children.sort((a, b) => (birthKey(tree.persons.get(a)) ?? Infinity) - (birthKey(tree.persons.get(b)) ?? Infinity))
  }
}

const birthKey = (p: Person | undefined) => sortKey(p?.birth?.date)

function inferDeceased(tree: Tree) {
  const thisYear = new Date().getFullYear()
  for (const p of tree.persons.values()) {
    if (p.events.some((e) => DEATH_TAGS.has(e.tag))) p.deceased = true
    else {
      const by = approxYear(p.birth?.date)
      if (by !== undefined) p.deceased = thisYear - by > 105 ? true : false
    }
  }
}

// ---------- navigation helpers ----------

export function parents(tree: Tree, id: string): { family?: Family; father?: Person; mother?: Person } {
  const p = tree.persons.get(id)
  const family = p?.famc.map((f) => tree.families.get(f)).find(Boolean)
  return {
    family,
    father: family?.husband ? tree.persons.get(family.husband) : undefined,
    mother: family?.wife ? tree.persons.get(family.wife) : undefined,
  }
}

export function spouseIn(f: Family, id: string): string | undefined {
  return f.husband === id ? f.wife : f.wife === id ? f.husband : undefined
}

export function unions(tree: Tree, id: string): { family: Family; spouse?: Person; children: Person[] }[] {
  const p = tree.persons.get(id)
  if (!p) return []
  return p.fams
    .map((fid) => tree.families.get(fid)!)
    .map((family) => {
      const sid = spouseIn(family, id)
      return {
        family,
        spouse: sid ? tree.persons.get(sid) : undefined,
        children: family.children.map((c) => tree.persons.get(c)!).filter(Boolean),
      }
    })
}

export function siblings(tree: Tree, id: string): { person: Person; half: boolean }[] {
  const p = tree.persons.get(id)
  if (!p) return []
  const out = new Map<string, boolean>()
  const myFamc = new Set(p.famc)
  const myParents = new Set(p.famc.flatMap((fid) => {
    const f = tree.families.get(fid)!
    return [f.husband, f.wife].filter((x): x is string => !!x)
  }))
  for (const fid of p.famc) for (const c of tree.families.get(fid)!.children) if (c !== id) out.set(c, false)
  for (const parentId of myParents) {
    for (const fid of tree.persons.get(parentId)?.fams ?? []) {
      if (myFamc.has(fid)) continue
      for (const c of tree.families.get(fid)!.children) if (c !== id && !out.has(c)) out.set(c, true)
    }
  }
  return [...out]
    .map(([sid, half]) => ({ person: tree.persons.get(sid)!, half }))
    .filter((s) => s.person)
    .sort((a, b) => (birthKey(a.person) ?? Infinity) - (birthKey(b.person) ?? Infinity))
}

export function fullName(p: Person | undefined): string {
  if (!p) return ''
  return [p.given, p.surname].filter(Boolean).join(' ') || 'Inconnu'
}
