import { arc } from 'd3-shape'
import { useEffect, useMemo, useRef, useState } from 'react'
import { fullName, type Person } from '../gedcom/model'
import { CENTER_R, fan, type FanCell } from '../layout/fan'
import { useApp } from '../state'
import { IconFit, IconMinus, IconPlus } from '../ui/icons'
import { Stepper } from '../ui/Stepper'
import { useZoom } from '../ui/useZoom'
import { fitText, lifespan, sideColor } from '../util'

const path = arc<FanCell>()
  .innerRadius((c) => c.r0)
  .outerRadius((c) => c.r1)
  .startAngle((c) => c.a0)
  .endAngle((c) => c.a1)
  .padAngle(0)

const deg = (rad: number) => (rad * 180) / Math.PI

function maxDepth(cells: FanCell[]) {
  return cells.reduce((m, c) => (c.personId ? Math.max(m, c.gen) : m), 0)
}

export function FanView() {
  const { tree, focusId, focus, selectedId, select, relations } = useApp()
  const [gens, setGens] = useState(6)
  const [hover, setHover] = useState<{ cell: FanCell; x: number; y: number } | null>(null)
  const { svgRef, gRef, fit, zoomBy } = useZoom(0.1, 4)
  const wrap = useRef<HTMLDivElement>(null)

  // Start with as many rings as the tree has (capped), once per focus person.
  const known = useMemo(() => maxDepth(fan(tree, focusId, 12)), [tree, focusId])
  useEffect(() => setGens(Math.max(3, Math.min(8, known + 1))), [focusId, known])

  const cells = useMemo(() => fan(tree, focusId, gens), [tree, focusId, gens])
  // Frame what is actually drawn: a deep single branch shouldn't shrink everything to fit an empty circle.
  const bounds = useMemo(() => {
    const pts: [number, number][] = [[-CENTER_R, -CENTER_R], [CENTER_R, CENTER_R]]
    for (const c of cells) {
      for (const a of [c.a0, (c.a0 + c.a1) / 2, c.a1]) for (const r of [c.r0, c.r1]) pts.push([r * Math.sin(a), -r * Math.cos(a)])
    }
    const xs = pts.map((p) => p[0])
    const ys = pts.map((p) => p[1])
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
  }, [cells])

  useEffect(() => fit(bounds, { animate: false, max: 1.4, padding: 24 }), [bounds, fit])

  const lit = useMemo(() => {
    if (!hover) return null
    const s = new Set<number>()
    for (let n = hover.cell.sosa; n >= 1; n >>= 1) s.add(n)
    return s
  }, [hover])

  const center = tree.persons.get(focusId)
  const hoverPerson = hover?.cell.personId ? tree.persons.get(hover.cell.personId) : undefined

  return (
    <div ref={wrap} style={{ position: 'absolute', inset: 0 }}>
      <svg ref={svgRef} className={`canvas${hover ? ' fan--hovering' : ''}`} role="img" aria-label="Éventail des ancêtres">
        <g ref={gRef}>
          {cells.map((c) => {
            const person = c.personId ? tree.persons.get(c.personId) : undefined
            const cls = ['fan-cell', !person && 'fan-cell--ghost', lit?.has(c.sosa) && 'fan-cell--lit', person && person.id === selectedId && 'fan-cell--selected'].filter(Boolean).join(' ')
            // Inner rings strongly tinted, fading outwards: generations read as rings of a trunk.
            const strength = Math.max(22, 50 - c.gen * 4)
            const fill = person ? `color-mix(in oklab, ${sideColor(c.side)} ${strength}%, var(--surface))` : undefined
            return (
              <g
                key={c.key}
                className={cls}
                onMouseMove={(e) => {
                  const r = wrap.current!.getBoundingClientRect()
                  setHover({ cell: c, x: e.clientX - r.left, y: e.clientY - r.top })
                }}
                onMouseLeave={() => setHover(null)}
                onClick={() => person && select(person.id)}
                onDoubleClick={() => person && focus(person.id)}
              >
                <path d={path(c)!} style={{ fill }} />
                {person && <CellText cell={c} person={person} />}
              </g>
            )
          })}
          <g onClick={() => select(focusId)} role="button" aria-label={fullName(center)}>
            <circle className="fan-center" r={CENTER_R - 4} />
            <text className="fan-text" textAnchor="middle">
              <tspan className="fan-text__given" x={0} dy={-6} fontSize={14}>{fitText(center?.given.split(' ')[0] || '?', "560 14px 'Literata Variable'", 120)}</tspan>
              <tspan className="fan-text__surname" x={0} dy={16} fontSize={10.5}>{center?.surname}</tspan>
              <tspan className="fan-text__meta" x={0} dy={15} fontSize={10.5}>{lifespan(center)}</tspan>
            </text>
          </g>
        </g>
      </svg>

      {hover && (
        <div className="tooltip" style={{ left: Math.min(hover.x + 14, (wrap.current?.clientWidth ?? 0) - 260), top: hover.y + 14 }}>
          {hoverPerson ? (
            <>
              <strong>{fullName(hoverPerson)}</strong>
              <span>{lifespan(hoverPerson) || 'Dates inconnues'}</span>
              <span>
                <i className="dot" style={{ background: sideColor(relations.get(hoverPerson.id)?.side ?? 'none') }} />
                {relations.get(hoverPerson.id)?.label}
              </span>
              <span className="muted">Sosa {hover.cell.sosa}</span>
            </>
          ) : (
            <>
              <strong>{hover.cell.sosa % 2 === 0 ? 'Père inconnu' : 'Mère inconnue'}</strong>
              <span className="muted">Sosa {hover.cell.sosa}, à rechercher</span>
            </>
          )}
        </div>
      )}

      <p className="hint">Survol pour suivre une lignée, double-clic pour recentrer</p>

      <div className="overlay-dock">
        <div className="overlay overlay--controls">
          <Stepper label="Générations" value={gens} min={2} max={10} onChange={setGens} />
          <span className="overlay__sep" />
          <button className="btn btn--quiet btn--icon" onClick={() => zoomBy(1.25)} aria-label="Zoomer"><IconPlus /></button>
          <button className="btn btn--quiet btn--icon" onClick={() => zoomBy(0.8)} aria-label="Dézoomer"><IconMinus /></button>
          <button className="btn btn--quiet btn--icon" onClick={() => fit(bounds, { max: 1.4, padding: 24 })} aria-label="Tout afficher"><IconFit /></button>
        </div>

        <div className="overlay overlay--legend" aria-label="Légende">
          <span><i className="dot" style={{ background: 'var(--paternal)' }} />Lignée du père</span>
          <span><i className="dot" style={{ background: 'var(--maternal)' }} />Lignée de la mère</span>
          <span><i className="dot dot--ghost" />Ancêtre à trouver</span>
        </div>
      </div>
    </div>
  )
}

/** Names across the ring near the center, along the radius further out where slices get thin. */
function CellText({ cell, person }: { cell: FanCell; person: Person }) {
  const mid = (cell.a0 + cell.a1) / 2
  const rMid = (cell.r0 + cell.r1) / 2
  const arcLen = (cell.a1 - cell.a0) * rMid
  const depth = cell.r1 - cell.r0
  const x = rMid * Math.sin(mid)
  const y = -rMid * Math.cos(mid)
  const given = person.given.split(' ')[0] || '?'
  const surname = person.surname
  const years = lifespan(person)

  if (cell.gen <= 3) {
    // tangential
    let rot = deg(mid)
    if (rot > 90) rot -= 180
    if (rot < -90) rot += 180
    const max = arcLen - 14
    const size = cell.gen === 1 ? 14 : 12.5
    return (
      <text className="fan-text" transform={`translate(${x},${y}) rotate(${rot})`} textAnchor="middle">
        <tspan className="fan-text__given" x={0} dy={-8} fontSize={size}>{fitText(given, `560 ${size}px 'Literata Variable'`, max)}</tspan>
        <tspan className="fan-text__surname" x={0} dy={size + 1} fontSize={10.5}>{fitText(surname, "650 10.5px 'Public Sans Variable'", max)}</tspan>
        <tspan className="fan-text__meta" x={0} dy={13} fontSize={10}>{fitText(years, "400 10px 'Public Sans Variable'", max)}</tspan>
      </text>
    )
  }

  // radial: lines stack across the slice, so the slice width limits how many fit
  if (arcLen < 9) return null
  const size = Math.min(12, Math.max(7.5, arcLen * 0.42))
  const lines = arcLen > 42 ? 3 : arcLen > 26 ? 2 : 1
  const rot = mid >= 0 ? deg(mid) - 90 : deg(mid) + 90
  const max = depth - 12
  const lh = size + 1.5
  const start = (-(lines - 1) * lh) / 2 + size * 0.35
  return (
    <text className="fan-text" transform={`translate(${x},${y}) rotate(${rot})`} textAnchor="middle">
      <tspan className="fan-text__given" x={0} y={start} fontSize={size}>{fitText(lines === 1 ? `${given} ${surname}` : given, `560 ${size}px 'Literata Variable'`, max)}</tspan>
      {lines >= 2 && <tspan className="fan-text__surname" x={0} y={start + lh} fontSize={size * 0.82}>{fitText(surname, `650 ${size * 0.82}px 'Public Sans Variable'`, max)}</tspan>}
      {lines >= 3 && <tspan className="fan-text__meta" x={0} y={start + lh * 2} fontSize={size * 0.8}>{fitText(years, `400 ${size * 0.8}px 'Public Sans Variable'`, max)}</tspan>}
    </text>
  )
}
