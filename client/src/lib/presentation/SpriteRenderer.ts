import {
  SPRITE_CLIPS,
  VFX_ATLASES,
  TYPE_VISUALS,
  type VisualType,
  type SpriteClip,
  type SpriteClipId,
} from './spriteRegistry'
import { MOVE_TYPE_GLYPHS } from '../../components/MoveIdentity/moveTypeGlyphs'
import { sceneAnchor } from './sceneLayout'

const images = new Map<string, Promise<HTMLImageElement | null>>()
const failed = new Map<string, number>()
const FAILURE_COOLDOWN_MS = 1000
type Job = (now: number) => boolean
const jobs = new Set<Job>()
const instances = new Set<object>()
let frame: number | null = null
const MAX_CLIPS = 24
const glyphs = new Map<VisualType, Path2D>()
function tick(now: number) {
  frame = null
  for (const job of [...jobs]) if (!job(now)) jobs.delete(job)
  if (jobs.size && frame === null) frame = requestAnimationFrame(tick)
}
function schedule(job: Job) {
  jobs.add(job)
  if (frame === null) frame = requestAnimationFrame(tick)
  return () => {
    jobs.delete(job)
    if (!jobs.size && frame !== null) {
      cancelAnimationFrame(frame)
      frame = null
    }
  }
}
export const spriteStats = () => ({
  active: instances.size,
  framesPending: frame === null ? 0 : 1,
  cached: images.size,
})
export function markVfxFailed(path: string) {
  if (Object.values(VFX_ATLASES).some((value) => value === path)) {
    failed.set(path, Date.now() + FAILURE_COOLDOWN_MS)
    images.delete(path)
  }
}
export function markVfxLoaded(path: string) {
  if (failed.delete(path)) images.delete(path)
}
function load(path: string): Promise<HTMLImageElement | null> {
  if (!Object.values(VFX_ATLASES).some((value) => value === path) || typeof Image === 'undefined')
    return Promise.resolve(null)
  const until = failed.get(path)
  if (until !== undefined && until > Date.now()) return Promise.resolve(null)
  if (until !== undefined) failed.delete(path)
  const cached = images.get(path)
  if (cached) return cached
  const pending = new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image()
    let settled = false
    const timer = setTimeout(() => done(null), 1500)
    function done(value: HTMLImageElement | null) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      image.onload = image.onerror = null
      if (!value) {
        failed.set(path, Date.now() + FAILURE_COOLDOWN_MS)
        images.delete(path)
      } else failed.delete(path)
      resolve(value)
    }
    image.onload = () => {
      const decoded = image.decode ? image.decode() : Promise.resolve()
      void decoded.then(
        () => done(image.naturalWidth > 0 && image.naturalHeight > 0 ? image : null),
        () => done(null)
      )
    }
    image.onerror = () => done(null)
    image.src = path
  })
  images.set(path, pending)
  return pending
}

/** Warm the same decoded atlas cache used by playback; cancellation is per waiter. */
export function preloadSpriteAtlas(path: string, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve()
  return new Promise<void>((resolve) => {
    const finish = () => {
      signal.removeEventListener('abort', finish)
      resolve()
    }
    signal.addEventListener('abort', finish, { once: true })
    void load(path).then(finish, finish)
  })
}
/** Dimensões reais do atlas; a geração pode entregar tamanho diferente do prompt. */
export function frameRect(width: number, height: number, clip: SpriteClip, index: number) {
  const w = width / (clip.columns ?? 8),
    h = height / (clip.rows ?? 8)
  const top = clip.cropTop ?? 0
  const bottom = clip.cropBottom ?? 0
  return {
    x: Math.max(0, Math.min(clip.frames - 1, index)) * w,
    y: (clip.row + top) * h,
    width: w,
    height: h * (1 - top - bottom),
  }
}
export interface SpriteOptions {
  signal: AbortSignal
  visualType?: VisualType
  loop?: boolean
  size?: number
  reverse?: boolean
  static?: boolean
  position?: 'center' | 'above'
  delay?: number
  /** Legacy callers can name a destination; artwork is placed there without travel. */
  travelTo?: HTMLElement | null
  paused?: () => boolean
  presentation?: 'orb' | 'beam' | 'wave' | 'area' | 'powder' | 'contact'
  rotate?: number
  anchor?: 'body' | 'head' | 'feet'
}

/** Um canvas por clip, relógio compartilhado, zero estado React por frame. */
export function playSprite(
  parent: HTMLElement | null,
  id: SpriteClipId,
  options: SpriteOptions
): Promise<void> {
  parent = options.travelTo ?? parent
  if (!parent || options.signal.aborted || typeof Image === 'undefined') return Promise.resolve()
  return new Promise<void>((resolve) => {
    const token = {}
    let stopped = false
    let cancelFrame = () => {}
    let canvas: HTMLCanvasElement | null = null
    const finish = () => {
      if (stopped) return
      stopped = true
      cancelFrame()
      canvas?.remove()
      instances.delete(token)
      options.signal.removeEventListener('abort', finish)
      resolve()
    }
    options.signal.addEventListener('abort', finish, { once: true })
    const prepare = async () => {
      let clip: SpriteClip = SPRITE_CLIPS[id]
      let image = await load(VFX_ATLASES[clip.atlas])
      if (stopped) return
      if (!image && clip.atlas !== 'attacks') {
        clip = SPRITE_CLIPS.impact
        image = await load(VFX_ATLASES.attacks)
      }
      if (stopped) return
      if (!image || instances.size >= MAX_CLIPS) {
        finish()
        return
      }
      canvas = document.createElement('canvas')
      const context = canvas.getContext?.('2d')
      if (!context) {
        finish()
        return
      }
      instances.add(token)
      const size = Math.min(240, Math.max(32, options.size ?? clip.size))
      const ratio = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = canvas.height = Math.round(size * ratio)
      canvas.style.width = canvas.style.height = `${size}px`
      canvas.style.maxWidth = 'none'
      canvas.className = `battle-sprite-fx${options.position === 'above' ? ' battle-sprite-fx-above' : ''}`
      canvas.setAttribute('aria-hidden', 'true')
      canvas.setAttribute('data-sprite-clip', id)
      const visual = options.visualType ? TYPE_VISUALS[options.visualType] : undefined
      let glyph: Path2D | undefined
      if (options.visualType && typeof Path2D !== 'undefined') {
        glyph = glyphs.get(options.visualType)
        if (!glyph) {
          glyph = new Path2D(MOVE_TYPE_GLYPHS[options.visualType])
          glyphs.set(options.visualType, glyph)
        }
        canvas.setAttribute('data-visual-type', options.visualType)
      }
      const source = image
      const origin = parent.getBoundingClientRect?.()
      // Short-lived effects use the stage plane rather than a transformed actor
      // stacking context. Persistent auras remain anchored to their local holder.
      const stage =
        !options.loop && !options.static ? parent.closest?.<HTMLElement>('[data-fx-stage]') : null
      const stageRect = stage?.getBoundingClientRect()
      ;(stage ?? parent).appendChild(canvas)
      const center = (rect: DOMRect | undefined) =>
        rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null
      const actor =
        parent
          .closest?.<HTMLElement>('[data-scene-side]')
          ?.querySelector<HTMLElement>('[data-battle-anchor]') ?? parent
      const startPoint = sceneAnchor(actor, options.anchor ?? 'body') ?? center(origin)
      const angle = options.rotate ?? 0
      const presentation = options.presentation ?? 'orb'
      if (!stage && origin && startPoint) {
        const point =
          options.position === 'above' ? (sceneAnchor(actor, 'head') ?? startPoint) : startPoint
        canvas.style.left = `${point.x - origin.left}px`
        canvas.style.top = `${point.y - origin.top - (options.position === 'above' ? size * 0.32 : 0)}px`
      }
      if (stage && stageRect && startPoint) {
        canvas.style.left = `${startPoint.x - stageRect.left - stage.clientLeft}px`
        canvas.style.top = `${startPoint.y - stageRect.top - stage.clientTop}px`
        canvas.style.zIndex = 'var(--z-effects, 30)'
      }
      const draw = (index: number) => {
        const rect = frameRect(source.naturalWidth, source.naturalHeight, clip, index)
        context.clearRect(0, 0, canvas!.width, canvas!.height)
        context.drawImage(
          source,
          rect.x,
          rect.y,
          rect.width,
          rect.height,
          0,
          (clip.cropTop ?? 0) * canvas!.height,
          canvas!.width,
          canvas!.height * (1 - (clip.cropTop ?? 0) - (clip.cropBottom ?? 0))
        )
        if (visual) {
          context.save()
          context.globalCompositeOperation = 'source-atop'
          context.globalAlpha = 0.45
          context.fillStyle = visual.color
          context.fillRect(0, 0, canvas!.width, canvas!.height)
          context.restore()
          if (glyph) {
            context.save()
            // Small type seal, outside the central body; no additional RAF or DOM node.
            const unit = (canvas!.width * 0.18) / 24
            context.translate(canvas!.width * 0.7, canvas!.height * 0.12)
            context.scale(unit, unit)
            context.fillStyle = visual.color
            context.shadowColor = '#fff'
            context.shadowBlur = 3 * ratio
            context.fill(glyph, 'evenodd')
            context.restore()
          }
        }
      }
      if (options.static) {
        draw(3)
        return
      }
      let start: number | null = null
      let previous = -1
      let lastTime: number | null = null
      let pausedTime = 0
      let wasPaused = false
      cancelFrame = schedule((now) => {
        if (stopped) return false
        start ??= now
        const delta = lastTime === null ? 0 : now - lastTime
        lastTime = now
        const paused = options.paused?.() ?? false
        if (paused || wasPaused) pausedTime += delta
        wasPaused = paused
        if (paused) return true
        const elapsed = now - start - pausedTime - (options.delay ?? 0)
        if (elapsed < 0) return true
        const step = Math.floor((elapsed * clip.fps) / 1000)
        if (!options.loop && step >= clip.frames) {
          finish()
          return false
        }
        const index = options.reverse ? clip.frames - 1 - (step % clip.frames) : step % clip.frames
        if (index !== previous) {
          draw(index)
          previous = index
          if (presentation === 'beam') {
            const pulse = Math.sin(Math.min(1, step / (clip.frames - 1)) * Math.PI)
            canvas!.style.transform = `translate(-50%, -50%) rotate(${angle}deg) scale(${0.8 + pulse * 0.2})`
            canvas!.style.opacity = `${0.25 + pulse * 0.75}`
          } else if (presentation === 'powder') {
            const progress = Math.min(1, step / (clip.frames - 1))
            canvas!.style.transform = `translate(-50%, -50%) scale(${0.8 + progress * 0.2})`
          } else if (presentation === 'area') {
            const progress = Math.min(1, step / (clip.frames - 1))
            canvas!.style.transform = `translate(-50%, -50%) scale(${0.8 + progress * 0.2})`
          }
        }
        return true
      })
    }
    void prepare().catch(finish)
  })
}
