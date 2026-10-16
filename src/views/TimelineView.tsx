import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { approxYear, isUncertain } from '../gedcom/date'
import { fullName, unions, type Person } from '../gedcom/model'
import type { Side } from '../gedcom/relationship'
import { useApp } from '../state'
import { age, fitText, lifespan, plural, sideColor, SIDE_LABEL } from '../util'

const ROW_H = 26
const LABEL_W = 230
const AXIS_H = 44
const ERAS = [
  { from: 1789, to: 1799, label: 'Révolution' },
  { from: 1870, to: 1871, label: '1870' },
  { from: 1914, to: 1918, label: '14–18' },
  { from: 1939, to: 1945, label: '39–45' },
]
const SIDE_ORDER: Side[] = ['self', 'both', 'paternal', 'maternal', 'descendant', 'alliance', 'none']
const NAME_FONT = "400 13px 'Literata Variable', Georgia, serif"

interface Row {
  person: Person
  start: number
  end: number
  startFuzzy: boolean
  /** 'death' known, 'alive' to today, 'unknown' fades out */
  ending: 'death' | 'alive' | 'unknown'
  endFuzzy: boolean
  side: Side
  marriages: number[]
}

export function TimelineView() {
  const { tree, relations, selectedId, select, setView } = useApp()
  const [order, setOrder] = useState<'birth' | 'side'>('birth')
  const [width, setWidth] = useState(1000)
  const [hover, setHover] = useState<{ row: Row; x: number; y: number } | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const now = new Date().getFullYear()

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { rows, undated } = useMemo(() => {
    const rows: Row[] = []
    let undated = 0
    for (const p of tree.persons.values()) {
      const b = approxYear(p.birth?.date)
      const d = approxYear(p.death?.date)
      if (b === undefined && d === undefined) {
        undated++
        continue
      }
      const ending = d !== undefined ? 'death' : p.deceased === false ? 'alive' : 'unknown'
      const start = b ?? d! - 60
      const end = d ?? (ending === 'alive' ? now : Math.min(now, start + 60))
      rows.push({
        person: p,
        start,
        end: Math.max(end, start + 1),
        startFuzzy: b === undefined || isUncertain(p.birth?.date),
        ending,
        endFuzzy: ending === 'unknown' || isUncertain(p.death?.date),
        side: relations.get(p.id)?.side ?? 'none',
        marriages: unions(tree, p.id)
          .map((u) => approxYear(u.family.events.find((e) => e.tag === 'MARR')?.date))
          .filter((y): y is number => y !== undefined),
      })
    }
    rows.sort((a, b) =>
      order === 'side'
        ? SIDE_ORDER.indexOf(a.side) - SIDE_ORDER.indexOf(b.side) || a.start - b.start
        : a.start - b.start || a.person.surname.localeCompare(b.person.surname),
    )
    return { rows, undated }
  }, [tree, relations, order, now])

  if (!rows.length) {
    return (
      <div className="doc"><div className="doc__inner">
        <h1>Aucune date pour l’instant</h1>
        <p className="lede">La chronologie place chaque vie sur une frise. Ajoutez des dates de naissance ou de décès dans le fichier pour la remplir.</p>
      </div></div>
    )
  }

  const minYear = Math.floor((Math.min(...rows.map((r) => r.start)) - 5) / 10) * 10
  const maxYear = now + 3
  const plotW = Math.max(width - LABEL_W - 24, (maxYear - minYear) * 2)
  const x = (y: number) => LABEL_W + ((y - minYear) / (maxYear - minYear)) * plotW
  const svgW = LABEL_W + plotW + 24
  const svgH = AXIS_H + rows.length * ROW_H + 12
  const step = maxYear - minYear > 300 ? 50 : 25
  const ticks: number[] = []
  for (let y = Math.ceil(minYear / step) * step; y <= maxYear; y += step) ticks.push(y)

  return (
    <div className="timeline" ref={box}>
      <div className="timeline__head">
        <div className="timeline__bar">
          <label>
            Trier{' '}
            <select className="select" value={order} onChange={(e) => setOrder(e.target.value as 'birth' | 'side')}>
              <option value="birth">par date de naissance</option>
              <option value="side">par branche</option>
            </select>
          </label>
          {undated > 0 && (
            <button className="btn btn--quiet" onClick={() => setView('a-completer')}>
              {plural(undated, 'personne sans date n’apparaît pas', 'personnes sans date n’apparaissent pas')}
            </button>
          )}
          <span className="legend">
            <span><i className="dot" style={{ background: 'var(--paternal)' }} />Paternel</span>
            <span><i className="dot" style={{ background: 'var(--maternal)' }} />Maternel</span>
            <span><i className="dot" style={{ background: 'var(--descendant)' }} />Descendance</span>
            <span><i className="dot" style={{ background: 'var(--alliance)' }} />Alliance</span>
            <span><svg width="10" height="10" viewBox="-5 -5 10 10" aria-hidden="true"><rect x="-3.5" y="-3.5" width="7" height="7" transform="rotate(45)" className="tl-marker" /></svg>Mariage</span>
          </span>
        </div>
      </div>

      <svg width={svgW} height={svgH} style={{ display: 'block' }} role="img" aria-label="Chronologie des vies">
        <defs>
          {(['paternal', 'maternal', 'descendant', 'alliance', 'self', 'both', 'none'] as Side[]).map((s) => (
            <g key={s}>
              <linearGradient id={`fade-in-${s}`}><stop offset="0" stopColor={sideColor(s)} stopOpacity="0" /><stop offset="1" stopColor={sideColor(s)} /></linearGradient>
              <linearGradient id={`fade-out-${s}`}><stop offset="0" stopColor={sideColor(s)} /><stop offset="1" stopColor={sideColor(s)} stopOpacity="0" /></linearGradient>
            </g>
          ))}
        </defs>

        {ERAS.filter((e) => e.to >= minYear).map((e) => (
          <g key={e.label} className="tl-era">
            <rect x={x(e.from)} y={AXIS_H - 4} width={Math.max(2, x(e.to + 1) - x(e.from))} height={svgH - AXIS_H} />
            <text x={x(e.from) + 3} y={AXIS_H - 8}>{e.label}</text>
          </g>
        ))}

        <g className="tl-axis">
          {ticks.map((t) => (
            <g key={t}>
              <line className="tl-grid" x1={x(t)} x2={x(t)} y1={AXIS_H - 4} y2={svgH} />
              <text x={x(t)} y={16} textAnchor="middle">{t}</text>
            </g>
          ))}
          <line className="tl-today" x1={x(now)} x2={x(now)} y1={22} y2={svgH} />
        </g>

        {rows.map((r, i) => {
          const y = AXIS_H + i * ROW_H
          const x0 = x(r.start)
          const x1 = x(r.end)
          const w = x1 - x0
          const fadeW = Math.min(w / 2, Math.max(10, (8 / (maxYear - minYear)) * plotW))
          const sel = r.person.id === selectedId
          const s = r.side
          return (
            <g
              key={r.person.id}
              className={`tl-row${sel ? ' tl-row--selected' : ''}`}
              onClick={() => select(r.person.id)}
              onMouseMove={(e) => {
                const b = box.current!.getBoundingClientRect()
                setHover({ row: r, x: e.clientX - b.left + box.current!.scrollLeft, y: e.clientY - b.top + box.current!.scrollTop })
              }}
              onMouseLeave={() => setHover(null)}
            >
              <rect className="tl-row__hit" x={0} y={y} width={svgW} height={ROW_H} rx={4} />
              <text className="tl-name" x={12} y={y + 17}>{fitText(fullName(r.person), NAME_FONT, LABEL_W - 24)}</text>
              {/* bar: solid core, gradient ends where the date is approximate or unknown */}
              <rect x={x0 + (r.startFuzzy ? fadeW : 0)} y={y + 9} width={Math.max(0, w - (r.startFuzzy ? fadeW : 0) - (r.endFuzzy ? fadeW : 0))} height={8} fill={sideColor(s)} />
              {r.startFuzzy && <rect x={x0} y={y + 9} width={fadeW} height={8} fill={`url(#fade-in-${s})`} />}
              {r.endFuzzy && <rect x={x1 - fadeW} y={y + 9} width={fadeW} height={8} fill={`url(#fade-out-${s})`} />}
              {!r.startFuzzy && <rect x={x0} y={y + 9} width={4} height={8} rx={2} fill={sideColor(s)} />}
              {r.marriages.map((m) => (
                <rect key={m} x={x(m) - 4} y={y + 9} width={8} height={8} transform={`rotate(45 ${x(m)} ${y + 13})`} className="tl-marker" />
              ))}
              <text className="tl-years" x={x1 + 6} y={y + 17}>{lifespan(r.person)}</text>
            </g>
          )
        })}
      </svg>

      {hover && (
        <div className="tooltip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          <strong>{fullName(hover.row.person)}</strong>
          <span>
            {lifespan(hover.row.person)}
            {age(hover.row.person) !== undefined && `, ${age(hover.row.person)} ans`}
          </span>
          <span>
            <i className="dot" style={{ background: sideColor(hover.row.side) }} />
            {relations.get(hover.row.person.id)?.label || SIDE_LABEL[hover.row.side]}
          </span>
          {hover.row.marriages.length > 0 && <span className="muted">Mariage : {hover.row.marriages.join(', ')}</span>}
        </div>
      )}
    </div>
  )
}
