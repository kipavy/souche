import { Fragment, type ReactNode } from 'react'
import { formatDate, formatYear } from '../gedcom/date'
import { fullName, parents, siblings, unions, type Citation, type LifeEvent, type Person } from '../gedcom/model'
import { useApp } from '../state'
import { age, lifespan, sideColor, SIDE_LABEL } from '../util'
import { IconClose, IconPin, IconTarget } from './icons'

export function PersonPanel({ id }: { id: string }) {
  const { tree, refId, setRefId, focusId, focus, select, relations, sosa, view, setView } = useApp()
  const p = tree.persons.get(id)
  if (!p) return null

  const rel = relations.get(id)
  const { father, mother } = parents(tree, id)
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
        {father ? <PersonChip p={father} /> : <GhostChip label="Père inconnu" />}
        {mother ? <PersonChip p={mother} /> : <GhostChip label="Mère inconnue" />}
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
                {spouse ? <PersonChip p={spouse} /> : <GhostChip label="Conjoint inconnu" />}
                {facts && <div className="union__label">{facts}</div>}
                {family.notes.map((n, i) => (
                  <p className="union__label" key={i}>{n}</p>
                ))}
                {children.length > 0 && (
                  <div className="chips" style={{ marginTop: '0.2rem' }}>
                    {children.map((c) => (
                      <PersonChip key={c.id} p={c} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </>
      )}

      {sibs.length > 0 && (
        <>
          <h4>Frères et sœurs</h4>
          <div className="chips">
            {sibs.map((s) => (
              <PersonChip key={s.person.id} p={s.person} extra={s.half ? 'demi' : undefined} />
            ))}
          </div>
        </>
      )}

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

function GhostChip({ label }: { label: string }) {
  return (
    <div className="chip chip--ghost">
      <i className="dot dot--ghost" />
      {label}
    </div>
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
