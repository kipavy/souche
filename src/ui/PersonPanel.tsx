import { Fragment, useMemo, type ReactNode } from 'react'
import { formatDate, formatYear } from '../gedcom/date'
import { coupleInbreeding, formatInbreeding, inbreeding } from '../gedcom/inbreeding'
import { fullName, parents, siblings, unions, type Citation, type LifeEvent, type Person } from '../gedcom/model'
import { useApp } from '../state'
import { age, lifespan, sideColor, SIDE_LABEL } from '../util'
import { IconClose, IconEdit, IconPin, IconPlus, IconTarget } from './icons'
import { PersonEditor } from './PersonEditor'

export function PersonPanel({ id }: { id: string }) {
  const { tree, refId, setRefId, focusId, focus, select, relations, sosa, view, setView, editingId, setEditingId, apply } = useApp()
  const p = tree.persons.get(id)
  if (!p) return null

  if (editingId === id) {
    return (
      <aside className="panel" aria-label={`Modifier ${fullName(p)}`}>
        <PersonEditor id={id} />
      </aside>
    )
  }

  const rel = relations.get(id)
  const { family: parentsFamily, father, mother } = parents(tree, id)
  const sibs = siblings(tree, id)
  const us = unions(tree, id)
  const a = age(p)
  const sosaNums = sosa.get(id)

  return (
    <aside className="panel" aria-label={`Fiche de ${fullName(p)}`}>
      <div className="panel__top">
        <span>{sosaNums && sosaNums[0] > 1 ? `Sosa ${sosaNums.join(', ')}` : ''}</span>
        <button className="btn btn--quiet btn--icon" onClick={() => select(null)} aria-label="Fermer la fiche">
          <IconClose />
        </button>
      </div>

      <h2 className="panel__given">{p.given || <em className="muted">Prénom inconnu</em>}</h2>
      <p className="panel__surname">{p.surname || <span className="muted">nom inconnu</span>}</p>

      {rel && (
        <div className="panel__relation">
          <i className={`dot${rel.side === 'both' ? ' dot--split' : ''}`} style={{ background: sideColor(rel.side) }} />
          {rel.label}
          {(rel.side === 'paternal' || rel.side === 'maternal') && <span className="muted" style={{ fontWeight: 400 }}>{SIDE_LABEL[rel.side].toLowerCase()}</span>}
        </div>
      )}
      <div className="panel__life">
        {lifespan(p) || 'Dates inconnues'}
        {a !== undefined && `, ${a} ans`}
      </div>

      <div className="panel__actions">
        {(focusId !== id || (view !== 'arbre' && view !== 'eventail')) && (
          <button
            className="btn btn--primary"
            onClick={() => {
              focus(id)
              if (view !== 'arbre' && view !== 'eventail') setView('arbre')
            }}
          >
            <IconTarget /> Centrer l’arbre ici
          </button>
        )}
        {refId !== id && (
          <button className="btn" onClick={() => setRefId(id)} title="Les liens de parenté seront calculés depuis cette personne">
            <IconPin /> Prendre comme référence
          </button>
        )}
        <button className="btn" onClick={() => setEditingId(id)}>
          <IconEdit /> Modifier
        </button>
      </div>

      {p.events.length > 0 && (
        <>
          <h3>Vie</h3>
          <ul className="events">
            {p.events.map((e, i) => (
              <EventRow key={i} e={e} />
            ))}
          </ul>
        </>
      )}

      <h3>Famille</h3>
      <h4>Parents</h4>
      <div className="chips">
        {father ? <PersonChip p={father} /> : <AddChip label="Ajouter le père" onClick={() => apply((d) => d.addParent(id, 'M'))} />}
        {mother ? <PersonChip p={mother} /> : <AddChip label="Ajouter la mère" onClick={() => apply((d) => d.addParent(id, 'F'))} />}
      </div>

      {us.length > 0 && (
        <>
          <h4>{us.length > 1 ? 'Unions' : 'Union'}</h4>
          {us.map(({ family, spouse, children }) => {
            const marr = family.events.find((e) => e.tag === 'MARR')
            const div = family.events.find((e) => e.tag === 'DIV')
            const facts = [marr && `mariage${marr.date ? ` ${formatYear(marr.date)}` : ''}`, div && `divorce${div.date ? ` ${formatYear(div.date)}` : ''}`].filter(Boolean).join(', ')
            return (
              <div className="union" key={family.id}>
                {spouse ? <PersonChip p={spouse} /> : <AddChip label="Ajouter le conjoint" onClick={() => apply((d) => d.addSpouse(id, family.id))} />}
                {facts && <div className="union__label">{facts}</div>}
                {family.husband && family.wife && <CoupleInbreeding husband={family.husband} wife={family.wife} />}
                {family.notes.map((n, i) => (
                  <p className="union__label" key={i}>{n}</p>
                ))}
                <div className="chips" style={{ marginTop: '0.2rem' }}>
                  {children.map((c) => (
                    <PersonChip key={c.id} p={c} />
                  ))}
                  <AddChip label="Ajouter un enfant" onClick={() => apply((d) => d.addChild(id, family.id))} />
                </div>
              </div>
            )
          })}
        </>
      )}
      {/* a single-parent union already offers its own "add partner" */}
      {us.every((u) => u.spouse) && (
        <div className="chips" style={{ marginTop: '0.6rem' }}>
          <AddChip label={us.length ? 'Ajouter une autre union' : 'Ajouter un conjoint'} onClick={() => apply((d) => d.addSpouse(id))} />
          {!us.length && <AddChip label="Ajouter un enfant" onClick={() => apply((d) => d.addChild(id))} />}
        </div>
      )}

      {(sibs.length > 0 || parentsFamily) && (
        <>
          <h4>Frères et sœurs</h4>
          <div className="chips">
            {sibs.map((s) => (
              <PersonChip key={s.person.id} p={s.person} extra={s.half ? 'demi' : undefined} />
            ))}
            {parentsFamily && <AddChip label="Ajouter un frère ou une sœur" onClick={() => apply((d) => d.addChild(id, parentsFamily.id))} />}
          </div>
        </>
      )}

      <Inbreeding id={id} />

      {p.notes.length > 0 && (
        <>
          <h3>Notes</h3>
          {p.notes.map((n, i) => (
            <p className="note" key={i}>{linkify(n)}</p>
          ))}
        </>
      )}

      <Sources person={p} />
    </aside>
  )
}

/** Wright's coefficient, shown only when the parents are related. */
function Inbreeding({ id }: { id: string }) {
  const { tree } = useApp()
  const ib = useMemo(() => inbreeding(tree, id), [tree, id])
  if (!ib.f) return null
  const { percent, fraction } = formatInbreeding(ib.f)
  return (
    <>
      <h3>Consanguinité</h3>
      <p className="inbreeding">
        <strong className="inbreeding__value num">{percent}</strong>
        <span className="muted num">{fraction}</span>
      </p>
      <p className="inbreeding__lede">
        Coefficient de Wright : probabilité d’avoir reçu deux fois le même gène d’un ancêtre commun aux deux parents.
      </p>
      <h4>{ib.common.flatMap((c) => c.ancestors).length > 1 ? 'Ancêtres communs des parents' : 'Ancêtre commun des parents'}</h4>
      {ib.common.map((c) => (
        <div className="union" key={c.ancestors.map((a) => a.id).join('+')}>
          <div className="union__label">Parents {c.label}</div>
          <div className="chips">
            {c.ancestors.map((a) => (
              <PersonChip key={a.id} p={a} />
            ))}
          </div>
        </div>
      ))}
      {ib.moreDistant && <p className="inbreeding__lede">S’y ajoutent des ancêtres communs plus éloignés.</p>}
    </>
  )
}

function CoupleInbreeding({ husband, wife }: { husband: string; wife: string }) {
  const { tree } = useApp()
  const ib = useMemo(() => coupleInbreeding(tree, husband, wife), [tree, husband, wife])
  if (!ib.f || !ib.common.length) return null
  const { percent, fraction } = formatInbreeding(ib.f)
  return (
    <div className="union__label" title="Coefficient de consanguinité (Wright) de leurs enfants">
      Conjoints {ib.common[0].label} : consanguinité des enfants {percent} ({fraction})
    </div>
  )
}

function EventRow({ e }: { e: LifeEvent }) {
  const { tree } = useApp()
  return (
    <li>
      <span className="events__date">{formatDate(e.date) || '—'}</span>
      <div>
        <div className="events__what">
          {e.label}
          {e.value && <span className="events__value"> : {e.value}</span>}
        </div>
        {e.place && <div className="events__place">{e.place}</div>}
        {e.notes.map((n, i) => (
          <div className="events__note" key={i}>{linkify(n)}</div>
        ))}
        {e.citations.map((c, i) => (
          <div className="events__source" key={i}>Source : {citationText(c, tree.sources)}</div>
        ))}
      </div>
    </li>
  )
}

function Sources({ person }: { person: Person }) {
  const { tree } = useApp()
  if (!person.citations.length) return null
  return (
    <>
      <h3>Sources</h3>
      <ul className="events">
        {person.citations.map((c, i) => (
          <li key={i} style={{ gridTemplateColumns: '1fr' }}>
            <span>{citationText(c, tree.sources)}</span>
          </li>
        ))}
      </ul>
    </>
  )
}

function citationText(c: Citation, sources: Map<string, { title: string; author?: string }>): string {
  const s = c.sourceId ? sources.get(c.sourceId) : undefined
  return [s?.title ?? c.text ?? c.sourceId, c.page].filter(Boolean).join(', ')
}

function PersonChip({ p, extra }: { p: Person; extra?: string }) {
  const { select, focus, relations } = useApp()
  const rel = relations.get(p.id)
  return (
    <button className="chip" onClick={() => select(p.id)} onDoubleClick={() => focus(p.id)} title={rel?.label}>
      <i className={`dot${rel?.side === 'both' ? ' dot--split' : ''}`} style={{ background: sideColor(rel?.side ?? 'none') }} />
      <span className="chip__name">{fullName(p)}</span>
      <span className="chip__meta">{[extra, lifespan(p)].filter(Boolean).join(', ')}</span>
    </button>
  )
}

/** Placeholder for a missing relative: clicking creates them and opens their card for editing. */
function AddChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="chip chip--add" onClick={onClick}>
      <IconPlus className="chip__plus" />
      {label}
    </button>
  )
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Turns URLs in notes into links; everything else stays text. */
function linkify(text: string): ReactNode {
  const parts = text.split(/(https?:\/\/[^\s)]+)/g)
  return parts.map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noreferrer noopener">
        {hostname(part)}
      </a>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  )
}
