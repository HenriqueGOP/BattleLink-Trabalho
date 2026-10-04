import metrics from '../../data/sprite-metrics.json'
import type { CSSProperties } from 'react'

export const SCENE_LAYOUT = Object.freeze({
  me: { x: 28, y: 86, depth: 1 },
  opponent: { x: 72, y: 60, depth: .82 },
  maxTravel: 82,
  maxVerticalTravel: 22,
})
export interface SpriteMetrics {
  width: number
  height: number
  bounds: number[]
  feet: number[]
  body: number[]
  head: number[]
}
const records: Readonly<Record<string, number[]>> = metrics
export const spriteMetricPaths = Object.keys(records)
const fallback: SpriteMetrics = { width: 96, height: 96, bounds: [0, 0, 96, 96], feet: [48, 96], body: [48, 48], head: [48, 20] }
export function spriteMetrics(path: string): SpriteMetrics {
  const entry = records[path]
  if (!entry) return fallback
  const [width, height, left, top, right, bottom] = entry
  const x = (left + right) / 2
  return { width, height, bounds: [left, top, right, bottom], feet: [x, bottom], body: [x, (top + bottom) / 2], head: [x, top + (bottom - top) * .2] }
}
/** Normalize visible extent once per variant, never against the current GIF frame. */
export function spriteLayout(path: string, referencePath = path): CSSProperties {
  const data = spriteMetrics(path)
  const [left, top, right, bottom] = data.bounds
  const extent = Math.max(right - left, bottom - top, 1)
  const reference = spriteMetrics(referencePath)
  const referenceExtent = Math.max(reference.bounds[2] - reference.bounds[0], reference.bounds[3] - reference.bounds[1], 1)
  const scale = 100 * referenceExtent / Math.max(reference.width, reference.height) / extent
  return {
    width: `${data.width * scale}%`,
    height: `${data.height * scale}%`,
    left: `${50 - data.feet[0] * scale}%`,
    top: `${100 - data.feet[1] * scale}%`,
    objectFit: 'fill',
  }
}
export function sceneAnchor(element: HTMLElement | null, kind: 'body' | 'head' | 'feet' = 'body') {
  const anchor = element?.querySelector?.<HTMLElement>(`[data-sprite-anchor="${kind}"]`) ?? element
  const rect = anchor?.getBoundingClientRect?.()
  return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null
}
export function spriteAnchorLayout(path: string, kind: 'body' | 'head' | 'feet', referencePath = path): CSSProperties {
  const data = spriteMetrics(path)
  const extent = Math.max(data.bounds[2] - data.bounds[0], data.bounds[3] - data.bounds[1], 1)
  const reference = spriteMetrics(referencePath)
  const referenceExtent = Math.max(reference.bounds[2] - reference.bounds[0], reference.bounds[3] - reference.bounds[1], 1)
  const scale = 100 * referenceExtent / Math.max(reference.width, reference.height) / extent
  return { left: '50%', top: `${100 - (data.feet[1] - data[kind][1]) * scale}%` }
}
