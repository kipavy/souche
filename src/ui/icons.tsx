import type { SVGProps } from 'react'

const base = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

export const IconSearch = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p} aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
)
export const IconClose = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p} aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
)
export const IconPlus = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p} aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
)
export const IconMinus = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p} aria-hidden="true"><path d="M5 12h14" /></svg>
)
export const IconFit = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p} aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
)
export const IconTarget = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p} aria-hidden="true"><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2.2" fill="currentColor" /></svg>
)
export const IconPin = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p} aria-hidden="true"><path d="M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11Z" /><circle cx="12" cy="10" r="2.2" /></svg>
)
export const IconFile = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p} aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>
)
export const IconSun = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p} aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" /></svg>
)
export const IconSave = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p} aria-hidden="true"><path d="M5 4h11l3 3v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z" /><path d="M8 4v5h7V4M8 20v-6h8v6" /></svg>
)
export const IconDownload = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p} aria-hidden="true"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14" /></svg>
)
export const IconEdit = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p} aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></svg>
)
export const IconTrash = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p} aria-hidden="true"><path d="M4.5 7h15M10 7V4.5h4V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5" /></svg>
)
export const IconSliders = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p} aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></svg>
)
export const IconMoon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p} aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" /></svg>
)

/** Tree rings cut in half: the stump the name refers to, and the shape of the fan chart. */
export function Logo(p: SVGProps<SVGSVGElement>) {
  const rings = [
    { r: 4, n: 1 },
    { r: 8, n: 2 },
    { r: 12, n: 4 },
    { r: 16, n: 8 },
  ]
  const cx = 18
  const cy = 19
  const arc = (r0: number, r1: number, a0: number, a1: number) => {
    const p = (r: number, a: number) => `${cx + r * Math.cos(a)} ${cy - r * Math.sin(a)}`
    return `M${p(r1, a0)}A${r1} ${r1} 0 0 0 ${p(r1, a1)}L${p(r0, a1)}A${r0} ${r0} 0 0 1 ${p(r0, a0)}Z`
  }
  return (
    <svg viewBox="0 0 36 22" {...p} aria-hidden="true">
      {rings.map(({ r, n }, i) =>
        Array.from({ length: n }, (_, k) => {
          const a0 = (Math.PI * k) / n
          const a1 = (Math.PI * (k + 1)) / n
          const fill = i === 0 ? 'var(--ink)' : k < n / 2 ? 'var(--paternal)' : 'var(--maternal)'
          return <path key={`${i}-${k}`} d={arc(i === 0 ? 0 : r - 3.2, r, a0, a1)} fill={fill} opacity={i === 0 ? 1 : 1 - i * 0.2} stroke="var(--surface)" strokeWidth="0.8" />
        }),
      )}
    </svg>
  )
}
