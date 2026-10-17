import { useMemo, useState } from 'react'
import { consanguineousCouples, formatInbreeding } from '../gedcom/inbreeding'
import { fullName } from '../gedcom/model'
import { auditTree, completeness, type IssueKind } from '../gedcom/quality'
import { brickWalls } from '../gedcom/relationship'
import { useApp } from '../state'
import { lifespan, plural, sideColor } from '../util'

const GROUPS: { kind: IssueKind; title: string; lede: string }[] = [
  { kind: 'incoherent', title: 'Incohérences', lede: 'Des dates qui se contredisent : souvent une faute de frappe ou une mauvaise personne rattachée.' },
  { kind: 'to-verify', title: 'Notes à vérifier', lede: 'Les notes qui mentionnent une hypothèse ou une confirmation à obtenir.' },
  { kind: 'no-birth', title: 'Sans date de naissance', lede: 'Même une date approximative (« vers 1850 ») aide à placer la personne.' },
  { kind: 'no-surname', title: 'Sans nom de famille', lede: '' },
  { kind: 'no-given', title: 'Sans prénom', lede: '' },
]

export function AuditView() {
  const { tree, refId, select, focus, setView, relations } = useApp()
  const issues = useMemo(() => auditTree(tree), [tree])
  const stats = useMemo(() => completeness(tree), [tree])
  const walls = useMemo(() => brickWalls(tree, refId), [tree, refId])
  const couples = useMemo(() => consanguineousCouples(tree), [tree])
  const [openGroup, setOpenGroup] = useState<IssueKind | null>(null)
  const ref = tree.persons.get(refId)

  const byGen = useMemo(() => {
    const m = new Map<number, typeof walls>()
    for (const w of walls) m.set(w.gen, [...(m.get(w.gen) ?? []), w])
    return [...m]
  }, [walls])

  const meters: [string, number, number][] = [
    ['Date de naissance', stats.withBirth, stats.persons],
    ['Lieu de naissance', stats.withPlace, stats.persons],
    ['Date de décès (personnes décédées)', stats.withDeathWhenDeceased, stats.deceased],
    ['Au moins une source citée', stats.sourced, stats.persons],
  ]
  const maxSurname = stats.surnames[0]?.count ?? 1
  const maxCentury = Math.max(1, ...stats.centuries.map((c) => c.count))

  return (
    <div className="doc">
      <div className="doc__inner">
        <h1>Ce qu’il reste à trouver</h1>
        <p className="lede">
          {plural(stats.persons, 'personne', 'personnes')} et {plural(stats.families, 'famille', 'familles')}
          {stats.span && <>, nées entre {stats.span.from} et {stats.span.to}. La plus ancienne connue : {stats.span.earliest}</>}.
        </p>

        <div className="meters">
          {meters.map(([label, n, total]) => (
            <Meter key={label} label={label} n={n} total={total} />
          ))}
        </div>

        <h2>Pistes de recherche</h2>
        <p className="lede">
          Les ancêtres directs de {fullName(ref)} dont on ne connaît pas encore les parents. Chaque nom ici est une branche à prolonger.
        </p>
        {byGen.length === 0 ? (
          <p className="muted">Aucun ancêtre direct sans parents : bravo.</p>
        ) : (
          <div className="walls">
            {byGen.map(([gen, list]) => (
              <div className="walls__gen" key={gen}>
                <div className="walls__gen-label">{genLabel(gen)}</div>
                <div className="walls__list">
                  {list.map((w) => (
                    <button
                      key={w.person.id}
                      className="walls__item"
                      onClick={() => {
                        focus(w.person.id)
                        select(w.person.id)
                        setView('arbre')
                      }}
                    >
                      <i className="dot" style={{ background: sideColor(relations.get(w.person.id)?.side ?? 'none') }} />
                      {fullName(w.person)}
                      <small>{w.missing === 'both' ? 'parents inconnus' : w.missing === 'father' ? 'père inconnu' : 'mère inconnue'}</small>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {GROUPS.map((g) => {
          const list = issues.filter((i) => i.kind === g.kind)
          if (!list.length) return null
          const limit = openGroup === g.kind ? list.length : 12
          return (
            <section key={g.kind}>
              <h2>
                {g.title} <span className="muted num">({list.length})</span>
              </h2>
              {g.lede && <p className="lede">{g.lede}</p>}
              <ul className="issues">
                {list.slice(0, limit).map((i, k) => {
                  const p = tree.persons.get(i.personId)
                  return (
                    <li key={k} onClick={() => select(i.personId)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && select(i.personId)}>
                      <span className="issues__who">
                        {fullName(p)} <span className="muted num">{lifespan(p)}</span>
                      </span>
                      <span>{i.message}</span>
                    </li>
                  )
                })}
              </ul>
              {list.length > limit && (
                <button className="btn btn--quiet" style={{ marginTop: '0.5rem' }} onClick={() => setOpenGroup(g.kind)}>
                  Afficher les {list.length - limit} autres
                </button>
              )}
            </section>
          )
        })}

        {couples.length > 0 && (
          <section>
            <h2>
              Unions consanguines <span className="muted num">({couples.length})</span>
            </h2>
            <p className="lede">Les couples apparentés par le sang, avec le coefficient de consanguinité (Wright) de leurs enfants.</p>
            <ul className="issues">
              {couples.map((c) => {
                const { percent, fraction } = formatInbreeding(c.inbreeding.f)
                // Open a child's card when there is one: it details the common ancestors.
                const target = tree.families.get(c.familyId)?.children[0] ?? c.husband.id
                return (
                  <li key={c.familyId} onClick={() => select(target)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && select(target)}>
                    <span className="issues__who">
                      {fullName(c.husband)} et {fullName(c.wife)}
                    </span>
                    <span>
                      <span className="num">{percent}</span> <span className="muted num">{fraction}</span>, {c.inbreeding.common[0]?.label}
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        <div className="cols">
          <section>
            <h2>Noms de famille</h2>
            <div className="bars">
              {stats.surnames.slice(0, 15).map((s) => (
                <Bar key={s.surname} label={s.surname} n={s.count} max={maxSurname} />
              ))}
            </div>
          </section>
          <section>
            <h2>Naissances par siècle</h2>
            <div className="bars">
              {stats.centuries.map((c) => (
                <Bar key={c.century} label={`${roman(c.century)}ᵉ siècle`} n={c.count} max={maxCentury} />
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function Meter({ label, n, total }: { label: string; n: number; total: number }) {
  const pct = total ? Math.round((n / total) * 100) : 0
  return (
    <>
      <span>{label}</span>
      <div className="meter" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div style={{ width: `${pct}%` }} />
      </div>
      <span className="num muted">
        {n} / {total}
      </span>
    </>
  )
}

function Bar({ label, n, max }: { label: string; n: number; max: number }) {
  return (
    <>
      <span>{label}</span>
      <div className="bars__bar" style={{ width: `${(n / max) * 100}%` }} title={`${label} : ${n}`} />
      <span className="num muted">{n}</span>
    </>
  )
}

function genLabel(gen: number) {
  if (gen === 0) return 'Référence'
  if (gen === 1) return 'Parents'
  if (gen === 2) return 'Grands-parents'
  if (gen === 3) return 'Arrière-grands-parents'
  return `${gen}ᵉ génération`
}

function roman(n: number) {
  const map: [number, string][] = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
  let out = ''
  for (const [v, s] of map) while (n >= v) {
    out += s
    n -= v
  }
  return out
}
