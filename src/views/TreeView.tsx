import { useEffect, useMemo, useRef, useState } from 'react'
import { hourglass, ROW } from '../layout/hourglass'
import { useApp } from '../state'
import { IconFit, IconMinus, IconPlus } from '../ui/icons'
import { PersonCard } from '../ui/PersonCard'
import { Stepper } from '../ui/Stepper'
import { useZoom } from '../ui/useZoom'

const read = (k: string, d: number) => {
  try {
    const v = Number(localStorage.getItem(k))
    return Number.isFinite(v) && localStorage.getItem(k) !== null ? v : d
  } catch {
    return d
  }
}
const write = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, String(v))
  } catch {
    /* private mode */
  }
}

export function TreeView() {
  const { tree, focusId, focus, selectedId, select, relations, sosa } = useApp()
  const [up, setUp] = useState(() => read('souche.up', 3))
  const [down, setDown] = useState(() => read('souche.down', 2))
  const [showSiblings, setShowSiblings] = useState(() => read('souche.siblings', 1) === 1)
  const [showUncles, setShowUncles] = useState(() => read('souche.uncles', 1) === 1)
  const { svgRef, gRef, fit, zoomBy } = useZoom()

  useEffect(() => write('souche.up', up), [up])
  useEffect(() => write('souche.down', down), [down])
  useEffect(() => write('souche.siblings', showSiblings ? 1 : 0), [showSiblings])
  useEffect(() => write('souche.uncles', showUncles ? 1 : 0), [showUncles])

  const layout = useMemo(() => hourglass(tree, focusId, { up, down, siblings: showSiblings, uncles: showUncles }), [tree, focusId, up, down, showSiblings, showUncles])

  // Reframe when the focus changes (not on every live reload of the file).
  const framedFor = useRef<string | null>(null)
  useEffect(() => {
    const key = `${focusId}|${up}|${down}|${showSiblings}|${showUncles}`
    const first = framedFor.current === null
    if (framedFor.current === key) return
    framedFor.current = key
    // Never frame smaller than readable cards; on small screens the focus and its parents stay in view.
    fit(layout.bounds, { animate: !first, min: 0.6, anchor: { x: 0, y: -ROW / 2 } })
  }, [focusId, up, down, showSiblings, showUncles, layout.bounds, fit])

  // Keep people in a stable DOM order so CSS transitions can slide them.
  const nodes = useMemo(() => [...layout.nodes].sort((a, b) => (a.key < b.key ? -1 : 1)), [layout.nodes])

  return (
    <>
      <svg ref={svgRef} className="canvas" role="img" aria-label="Arbre généalogique">
        <g ref={gRef}>
          <g className="links" key={`${focusId}|${up}|${down}|${showSiblings}|${showUncles}`}>
            {layout.links.map((l) => (
              <path key={l.key} d={l.d} className={`link link--${l.kind}`} />
            ))}
          </g>
          {nodes.map((n) => (
            <PersonCard
              key={n.key}
              node={n}
              person={n.personId ? tree.persons.get(n.personId) : undefined}
              relation={n.personId ? relations.get(n.personId) : undefined}
              sosa={n.personId ? sosa.get(n.personId)?.[0] : undefined}
              selected={n.personId === selectedId}
              onSelect={select}
              onFocus={focus}
            />
          ))}
        </g>
      </svg>

      <p className="hint">Double-clic sur une personne pour recentrer l’arbre</p>

      <div className="overlay overlay--controls">
        <Stepper label="Ascendants" value={up} min={0} max={12} onChange={setUp} />
        <Stepper label="Descendants" value={down} min={0} max={10} onChange={setDown} />
        <label className="switch">
          <input type="checkbox" checked={showSiblings} onChange={(e) => setShowSiblings(e.target.checked)} />
          Frères et sœurs
        </label>
        <label className="switch" title={up < 2 ? 'Affichez au moins 2 générations d’ascendants' : undefined}>
          <input type="checkbox" checked={showUncles} disabled={up < 2} onChange={(e) => setShowUncles(e.target.checked)} />
          Oncles et tantes
        </label>
        <span className="overlay__sep" />
        <button className="btn btn--quiet btn--icon" onClick={() => zoomBy(1.25)} aria-label="Zoomer"><IconPlus /></button>
        <button className="btn btn--quiet btn--icon" onClick={() => zoomBy(0.8)} aria-label="Dézoomer"><IconMinus /></button>
        <button className="btn btn--quiet btn--icon" onClick={() => fit(layout.bounds)} aria-label="Tout afficher"><IconFit /></button>
      </div>

      <Legend />
    </>
  )
}

export function Legend() {
  return (
    <div className="overlay overlay--legend" aria-label="Légende">
      <span><i className="dot" style={{ background: 'var(--paternal)' }} />Côté paternel</span>
      <span><i className="dot" style={{ background: 'var(--maternal)' }} />Côté maternel</span>
      <span><i className="dot dot--split" />Fratrie</span>
      <span><i className="dot" style={{ background: 'var(--descendant)' }} />Descendance</span>
      <span><i className="dot" style={{ background: 'var(--alliance)' }} />Par alliance</span>
      <span><i className="dot dot--ghost" />Inconnu</span>
    </div>
  )
}
