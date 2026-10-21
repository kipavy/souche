import { useRef } from 'react'
import { canWatchFiles } from '../source/loader'
import { IconFile, IconPlus } from './icons'

interface Props {
  error: string | null
  savedName?: string
  onOpen: () => Promise<boolean>
  onFile: (f: File) => void
  onReopen: () => void
  onSample: () => void
  onNew: () => void
}

export function Welcome({ error, savedName, onOpen, onFile, onReopen, onSample, onNew }: Props) {
  const input = useRef<HTMLInputElement>(null)

  return (
    <main className="welcome">
      <Rings />
      <div className="welcome__body">
        <h1>Souche</h1>
        <p>Votre arbre généalogique, lisible d’un coup d’œil. Ouvrez un fichier GEDCOM (.ged) ou commencez-en un : il reste sur cet appareil, rien n’est envoyé nulle part.</p>
        {error && <p className="error">{error}</p>}
        <div className="welcome__actions">
          {savedName && (
            <button className="btn btn--primary" onClick={onReopen}>
              <IconFile /> Rouvrir {savedName}
            </button>
          )}
          <button
            className={`btn${savedName ? '' : ' btn--primary'}`}
            onClick={async () => {
              if (!(await onOpen())) input.current?.click()
            }}
          >
            <IconFile /> Ouvrir un fichier .ged
          </button>
          <button className="btn" onClick={onNew}>
            <IconPlus /> Créer un arbre
          </button>
          <button className="btn" onClick={onSample}>
            Voir un exemple
          </button>
        </div>
        <input
          ref={input}
          type="file"
          accept=".ged,.gedcom,text/plain"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onFile(f)
            e.target.value = ''
          }}
        />
        <p className="welcome__fine">
          {canWatchFiles
            ? 'Le fichier est relu dès que vous l’enregistrez : gardez Souche ouvert à côté de votre éditeur.'
            : 'Astuce : dans Chrome ou Edge, Souche relit le fichier à chaque enregistrement.'}{' '}
          Vous pouvez aussi glisser le fichier sur la page.
        </p>
      </div>
    </main>
  )
}

/** Concentric rings split into 2, 4, 8… segments: generations of a fan chart, rings of a stump. */
function Rings() {
  const rings = 9
  const paths: { d: string; o: number; side: 'p' | 'm' }[] = []
  for (let i = 1; i <= rings; i++) {
    const r1 = 30 + i * 52
    const r0 = r1 - 46
    const n = 2 ** Math.min(i, 7)
    for (let k = 0; k < n; k++) {
      const a0 = Math.PI + (Math.PI * k) / n
      const a1 = Math.PI + (Math.PI * (k + 1)) / n
      const pt = (r: number, a: number) => `${(500 + r * Math.cos(a)).toFixed(1)} ${(500 + r * Math.sin(a)).toFixed(1)}`
      paths.push({
        d: `M${pt(r0, a0)}L${pt(r1, a0)}A${r1} ${r1} 0 0 1 ${pt(r1, a1)}L${pt(r0, a1)}A${r0} ${r0} 0 0 0 ${pt(r0, a0)}Z`,
        o: 0.55 - i * 0.05,
        side: k < n / 2 ? 'p' : 'm',
      })
    }
  }
  return (
    <svg className="welcome__rings" viewBox="0 0 1000 1000" aria-hidden="true">
      {paths.map((p, i) => (
        <path
          key={i}
          d={p.d}
          fill={`color-mix(in oklab, var(${p.side === 'p' ? '--paternal' : '--maternal'}) ${Math.round(p.o * 40)}%, transparent)`}
          stroke="var(--paper)"
          strokeWidth="3"
        />
      ))}
    </svg>
  )
}
