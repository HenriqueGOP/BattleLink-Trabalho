import { SPRITE_CLIPS, VFX_ATLASES, type SpriteClip, type SpriteClipId } from './spriteRegistry'

const images = new Map<string, Promise<HTMLImageElement | null>>()
const failed = new Set<string>()
type Job = (now: number) => boolean
const jobs = new Set<Job>()
const instances = new Set<object>()
let frame: number | null = null
const MAX_CLIPS = 24
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
  if (Object.values(VFX_ATLASES).some((value) => value === path)) failed.add(path)
}
function load(path: string): Promise<HTMLImageElement | null> {
  if (failed.has(path) || typeof Image === 'undefined') return Promise.resolve(null)
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
      if (!value) failed.add(path)
      resolve(value)
    }
    image.onload = () => done(image.naturalWidth > 0 && image.naturalHeight > 0 ? image : null)
    image.onerror = () => done(null)
    image.src = path
  })
  images.set(path, pending)
  return pending
}
/** Dimensões reais do atlas; a geração pode entregar tamanho diferente do prompt. */
export function frameRect(width: number, height: number, clip: SpriteClip, index: number) {
  const w = width / 8,
    h = height / 8
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
  loop?: boolean
  size?: number
  reverse?: boolean
  static?: boolean
  position?: 'center' | 'above'
  delay?: number
  travelTo?: HTMLElement | null
  paused?: () => boolean
}

/** Um canvas por clip, relógio compartilhado, zero estado React por frame. */
export function playSprite(
  parent: HTMLElement | null,
  id: SpriteClipId,
  options: SpriteOptions
): Promise<void> {
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
      canvas.className = `battle-sprite-fx${options.position === 'above' ? ' battle-sprite-fx-above' : ''}`
      canvas.setAttribute('aria-hidden', 'true')
      canvas.setAttribute('data-sprite-clip', id)
      parent.appendChild(canvas)
      const source = image
      const origin = parent.getBoundingClientRect?.()
      const destination = options.travelTo?.getBoundingClientRect?.()
      const travel =
        origin && destination
          ? {
              x: destination.left + destination.width / 2 - origin.left - origin.width / 2,
              y: destination.top + destination.height / 2 - origin.top - origin.height / 2,
            }
          : null
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
          if (travel) {
            const progress = Math.min(1, step / (clip.frames - 1))
            canvas!.style.transform = `translate(calc(-50% + ${travel.x * progress}px), calc(-50% + ${travel.y * progress}px))`
          }
        }
        return true
      })
    }
    void prepare().catch(finish)
  })
}
