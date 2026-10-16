import { select } from 'd3-selection'
import 'd3-transition'
import { zoom, zoomIdentity, type ZoomBehavior } from 'd3-zoom'
import { useCallback, useEffect, useRef } from 'react'

export interface Bounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Pan & zoom an SVG <g> with d3-zoom, writing the transform straight to the DOM (no React re-render per frame). */
export function useZoom(minScale = 0.15, maxScale = 2.5) {
  const svgRef = useRef<SVGSVGElement>(null)
  const gRef = useRef<SVGGElement>(null)
  const behavior = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null)

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const z = zoom<SVGSVGElement, unknown>()
      .scaleExtent([minScale, maxScale])
      .filter((e: Event) => !(e.type === 'dblclick')) // double-click recenters on a person instead
      .on('zoom', (e) => gRef.current?.setAttribute('transform', e.transform.toString()))
    select(svg).call(z)
    behavior.current = z
    return () => {
      select(svg).on('.zoom', null)
    }
  }, [minScale, maxScale])

  const apply = useCallback((t: ReturnType<typeof zoomIdentity.translate>, animate: boolean) => {
    const svg = svgRef.current
    const z = behavior.current
    if (!svg || !z) return
    if (animate && !reduceMotion()) select(svg).transition().duration(550).call(z.transform, t)
    else select(svg).call(z.transform, t)
  }, [])

  const fit = useCallback(
    (b: Bounds, opts: { animate?: boolean; padding?: number; min?: number; max?: number; anchor?: { x: number; y: number } } = {}) => {
      const svg = svgRef.current
      if (!svg) return
      const { width, height } = svg.getBoundingClientRect()
      if (!width || !height) return
      const pad = opts.padding ?? 48
      const k = Math.max(opts.min ?? minScale, Math.min(opts.max ?? 1, (width - pad * 2) / (b.maxX - b.minX), (height - pad * 2) / (b.maxY - b.minY)))
      // When everything fits, center the bounds; otherwise keep the anchor (focus person) in view.
      const fitsAll = (b.maxX - b.minX) * k <= width - pad && (b.maxY - b.minY) * k <= height - pad
      const cx = fitsAll || !opts.anchor ? (b.minX + b.maxX) / 2 : opts.anchor.x
      const cy = fitsAll || !opts.anchor ? (b.minY + b.maxY) / 2 : opts.anchor.y
      apply(zoomIdentity.translate(width / 2 - cx * k, height / 2 - cy * k).scale(k), opts.animate ?? true)
    },
    [apply, minScale],
  )

  const zoomBy = useCallback((factor: number) => {
    const svg = svgRef.current
    const z = behavior.current
    if (!svg || !z) return
    select(svg).transition().duration(reduceMotion() ? 0 : 250).call(z.scaleBy, factor)
  }, [])

  return { svgRef, gRef, fit, zoomBy }
}
