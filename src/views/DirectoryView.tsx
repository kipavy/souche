import { useMemo, useState } from 'react'
import { formatDate, sortKey } from '../gedcom/date'
import type { Person } from '../gedcom/model'
import { useApp } from '../state'
import { normalize, plural, sideColor, shortPlace } from '../util'

type SortKey = 'name' | 'birth' | 'death' | 'relation' | 'sosa'

export function DirectoryView() {
  const { tree, relations, sosa, selectedId, select } = useApp()
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 })

  const rows = useMemo(() => {
    const words = normalize(q).split(/\s+/).filter(Boolean)
    const hay = (p: Person) => normalize([p.given, p.surname, p.birth?.place, p.death?.place, relations.get(p.id)?.label, ...p.events.map((e) => e.value)].join(' '))
    const list = [...tree.persons.values()].filter((p) => words.every((w) => hay(p).includes(w)))
    const val = (p: Person): string | number => {
      switch (sort.key) {
        case 'name': return normalize(`${p.surname || '~'} ${p.given}`)
        case 'birth': return sortKey(p.birth?.date) ?? Infinity
        case 'death': return sortKey(p.death?.date) ?? Infinity
        case 'relation': return relations.get(p.id)?.degree ?? Infinity
        case 'sosa': return sosa.get(p.id)?.[0] ?? Infinity
      }
    }
    return list.sort((a, b) => {
      const va = val(a)
      const vb = val(b)
      return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir
    })
  }, [tree, relations, sosa, q, sort])

  const header = (key: SortKey, label: string, cls?: string) => (
    <th className={cls} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button onClick={() => setSort((s) => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : 1 }))}>
        {label} {sort.key === key ? (sort.dir === 1 ? '↑' : '↓') : ''}
      </button>
    </th>
  )

  return (
    <div className="doc">
      <div className="doc__inner">
        <h1>Répertoire</h1>
        <p className="lede">{plural(tree.persons.size, 'personne', 'personnes')} dans l’arbre. Cherchez par nom, lieu, métier ou lien de parenté.</p>
        <div className="toolbar">
          <input className="input" type="search" placeholder="Ex. : Morel, Lyon, cousin…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filtrer" />
          {q && <span className="muted">{plural(rows.length, 'résultat', 'résultats')}</span>}
        </div>
        <table className="table">
          <thead>
            <tr>
              {header('name', 'Nom')}
              {header('birth', 'Naissance')}
              {header('death', 'Décès', 'hide-sm')}
              {header('relation', 'Lien')}
              {header('sosa', 'Sosa', 'hide-sm')}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const r = relations.get(p.id)
              return (
                <tr key={p.id} onClick={() => select(p.id)} aria-selected={p.id === selectedId}>
                  <td>
                    <span className="table__name">{p.given || <em className="muted">Prénom inconnu</em>}</span>{' '}
                    <span className="table__surname">{p.surname}</span>
                  </td>
                  <td>
                    <div className="num">{formatDate(p.birth?.date)}</div>
                    <div className="table__sub">{shortPlace(p.birth?.place)}</div>
                  </td>
                  <td className="hide-sm">
                    <div className="num">{formatDate(p.death?.date)}</div>
                    <div className="table__sub">{shortPlace(p.death?.place)}</div>
                  </td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                      <i className={`dot${r?.side === 'both' ? ' dot--split' : ''}`} style={{ background: sideColor(r?.side ?? 'none') }} />
                      {r?.label}
                    </span>
                  </td>
                  <td className="hide-sm num">{sosa.get(p.id)?.join(', ')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
