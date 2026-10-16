import { memo } from 'react'
import type { Person } from '../gedcom/model'
import type { Relation } from '../gedcom/relationship'
import { CARD_H, CARD_W, type LayoutNode } from '../layout/hourglass'
import { fitText, lifespan, shortPlace, sideColor } from '../util'

const GIVEN_FONT = "560 14px 'Literata Variable', Georgia, serif"
const SURNAME_FONT = "650 11px 'Public Sans Variable', system-ui, sans-serif"
const META_FONT = "400 11px 'Public Sans Variable', system-ui, sans-serif"
const PAD = 16
const TEXT_W = CARD_W - PAD - 12

interface Props {
  node: LayoutNode
  person?: Person
  relation?: Relation
  sosa?: number
  selected: boolean
  onSelect: (id: string) => void
  onFocus: (id: string) => void
}

export const PersonCard = memo(function PersonCard({ node, person, relation, sosa, selected, onSelect, onFocus }: Props) {
  const x = node.x - CARD_W / 2
  const y = node.y - CARD_H / 2
  const style = { transform: `translate(${x}px, ${y}px)` }

  if (!person) {
    return (
      <g className="card card--ghost" style={style} aria-label={node.ghostLabel}>
        <rect className="card__box" width={CARD_W} height={CARD_H} rx={10} />
        <text className="card__ghost-label" x={CARD_W / 2} y={CARD_H / 2 + 4} textAnchor="middle">{node.ghostLabel}</text>
      </g>
    )
  }

  const side = relation?.side ?? 'none'
  const given = person.given || 'Prénom inconnu'
  const meta = [lifespan(person), shortPlace(person.birth?.place)].filter(Boolean).join('  ')
  const cls = ['card', node.role === 'focus' && 'card--focus', selected && 'card--selected'].filter(Boolean).join(' ')
  const clipId = `clip-${node.key.replace(/[^\w-]/g, '_')}`
  const label = `${given} ${person.surname}${relation?.label ? `, ${relation.label}` : ''}`

  return (
    <g
      className={cls}
      style={style}
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={() => onSelect(person.id)}
      onDoubleClick={() => onFocus(person.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSelect(person.id)
        if (e.key === ' ') {
          e.preventDefault()
          onFocus(person.id)
        }
      }}
    >
      <title>{label}</title>
      <rect className="card__box" width={CARD_W} height={CARD_H} rx={10} />
      {/* lineage stripe; full siblings belong to both sides */}
      <clipPath id={clipId}>
        <rect width={CARD_W} height={CARD_H} rx={10} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        {side === 'both' ? (
          <>
            <rect width={5} height={CARD_H / 2} fill="var(--paternal)" />
            <rect y={CARD_H / 2} width={5} height={CARD_H / 2} fill="var(--maternal)" />
          </>
        ) : (
          <rect width={5} height={CARD_H} fill={sideColor(side)} opacity={side === 'none' ? 0.5 : 1} />
        )}
      </g>
      <text className="card__given" x={PAD} y={22} fontStyle={person.given ? undefined : 'italic'}>
        {fitText(given, GIVEN_FONT, sosa ? TEXT_W - 22 : TEXT_W)}
      </text>
      <text className="card__surname" x={PAD} y={38}>
        {fitText(person.surname || '—', SURNAME_FONT, TEXT_W)}
      </text>
      <text className="card__meta" x={PAD} y={54}>
        {fitText(meta, META_FONT, TEXT_W)}
      </text>
      {sosa !== undefined && sosa > 1 && (
        <text className="card__sosa" x={CARD_W - 9} y={17} textAnchor="end">
          {sosa}
        </text>
      )}
      {node.moreUp && <Pill x={CARD_W / 2} y={0} text="▲" />}
      {node.moreDown ? <Pill x={CARD_W / 2} y={CARD_H} text={`+${node.moreDown}`} /> : null}
      {node.half && <Pill x={CARD_W - 24} y={0} text="demi" />}
    </g>
  )
})

function Pill({ x, y, text }: { x: number; y: number; text: string }) {
  const w = Math.max(22, text.length * 6.5 + 10)
  return (
    <g transform={`translate(${x - w / 2}, ${y - 8})`}>
      <rect className="card__pill" width={w} height={16} rx={8} />
      <text className="card__pill-text" x={w / 2} y={11.5} textAnchor="middle">{text}</text>
    </g>
  )
}
