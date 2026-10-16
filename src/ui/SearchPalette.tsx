import { useEffect, useMemo, useRef, useState } from 'react'
import { fullName } from '../gedcom/model'
import { useApp } from '../state'
import { lifespan, normalize, sideColor } from '../util'

export function SearchPalette({ onClose }: { onClose: () => void }) {
  const { tree, relations, focus, select, view, setView } = useApp()
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => input.current?.focus(), [])

  const results = useMemo(() => {
    const words = normalize(q).split(/\s+/).filter(Boolean)
    const all = [...tree.persons.values()]
    const scored = all
      .map((p) => {
        const name = normalize(`${p.given} ${p.surname}`)
        if (!words.every((w) => name.includes(w))) return null
        // Prefix matches on a word first, then by closeness of kin.
        const prefix = words.every((w) => name.split(/\s|-/).some((part) => part.startsWith(w))) ? 0 : 1
        return { p, score: prefix * 1000 + (relations.get(p.id)?.degree ?? 99) }
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => a.score - b.score)
    return scored.slice(0, 40).map((s) => s.p)
  }, [q, tree, relations])

  useEffect(() => setActive(0), [q])

  const choose = (id: string) => {
    focus(id)
    select(id)
    if (view !== 'arbre' && view !== 'eventail') setView('arbre')
    onClose()
  }

  return (
    <div className="palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-label="Rechercher une personne">
        <input
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher une personne…"
          aria-controls="palette-results"
          aria-activedescendant={results[active] ? `res-${results[active].id}` : undefined}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose()
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((a) => Math.min(results.length - 1, a + 1))
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((a) => Math.max(0, a - 1))
            }
            if (e.key === 'Enter' && results[active]) choose(results[active].id)
          }}
        />
        {results.length === 0 ? (
          <p className="palette__empty">Personne ne porte ce nom dans l’arbre.</p>
        ) : (
          <ul id="palette-results" role="listbox">
            {results.map((p, i) => {
              const r = relations.get(p.id)
              return (
                <li
                  key={p.id}
                  id={`res-${p.id}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(p.id)}
                >
                  <i className={`dot${r?.side === 'both' ? ' dot--split' : ''}`} style={{ background: sideColor(r?.side ?? 'none') }} />
                  <span className="palette__name">{fullName(p)}</span>
                  <span className="palette__meta">{[lifespan(p), r?.label].filter(Boolean).join(', ')}</span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
