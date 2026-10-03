import gsap from 'gsap'
import type { CanonicalEvent, RoomSnapshot, CombatantId } from '../../types/protocol'
import type { EventRunner } from './BattleEventQueue'
import { IMPACT } from './impact'
import { playSprite } from './SpriteRenderer'
import { attackClip, projectileMove, isChargingMove, type SpriteClipId } from './spriteRegistry'

interface Scene {
  stage: () => HTMLElement | null
  sprite: (side: 'me' | 'opponent') => HTMLElement | null
  sound?: (event: CanonicalEvent, wire: RoomSnapshot) => void
  reducedMotion?: () => boolean
}
class EffectScope {
  private cleanups = new Set<() => void>()
  private stopped = false
  private animations = new Set<Animation>()
  spritePaused = false
  get cancelled() {
    return this.stopped || this.signal.aborted
  }
  readonly signal: AbortSignal
  constructor(signal: AbortSignal) {
    this.signal = signal
    signal.addEventListener('abort', this.dispose, { once: true })
  }
  own(cleanup: () => void) {
    this.cleanups.add(cleanup)
  }
  wait(ms: number) {
    if (this.cancelled) return Promise.resolve()
    return new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms)
      this.own(() => {
        clearTimeout(timer)
        resolve()
      })
    })
  }
  paint() {
    if (this.cancelled) return Promise.resolve()
    return new Promise<void>((resolve) => {
      const frame = requestAnimationFrame(() => resolve())
      this.own(() => {
        cancelAnimationFrame(frame)
        resolve()
      })
    })
  }
  animate(element: HTMLElement | null, frames: Keyframe[], options: KeyframeAnimationOptions) {
    if (!element?.animate || this.cancelled) return Promise.resolve()
    const animation = element.animate(frames, { fill: 'none', ...options })
    this.animations.add(animation)
    this.own(() => animation.cancel())
    return animation.finished.then(
      () => undefined,
      (error) => {
        if (!this.signal.aborted && error?.name !== 'AbortError') throw error
      }
    )
  }
  async hitStop(ms: number) {
    this.spritePaused = true
    for (const animation of this.animations) animation.pause()
    await this.wait(ms)
    this.spritePaused = false
    if (!this.cancelled)
      for (const animation of this.animations)
        if (animation.playState === 'paused') animation.play()
  }
  lunge(element: HTMLElement, direction: number) {
    if (this.cancelled) return Promise.resolve()
    return new Promise<void>((resolve) => {
      const context = gsap.context(() => {
        gsap
          .timeline({ onComplete: resolve })
          .to(element, { x: -direction * 5, scaleX: 0.94, duration: 0.07 })
          .to(element, {
            x: direction * 28,
            y: -6,
            scaleX: 1.05,
            duration: 0.13,
            ease: 'power2.out',
          })
          .to(element, { x: 0, y: 0, scaleX: 1, duration: 0.18, ease: 'power2.inOut' })
      })
      this.own(() => {
        context.revert()
        resolve()
      })
    })
  }
  dispose = () => {
    if (this.stopped) return
    this.stopped = true
    this.signal.removeEventListener('abort', this.dispose)
    for (const cleanup of this.cleanups) cleanup()
    this.cleanups.clear()
    this.animations.clear()
  }
}
const majorClips: Record<string, SpriteClipId> = {
  brn: 'burn',
  psn: 'poison',
  tox: 'poison',
  par: 'electric',
  slp: 'sleep',
  frz: 'ice',
}
/** Efeitos artísticos vêm dos atlas; WAAPI/GSAP controlam somente movimento e HP. */
export class AnimationDirector implements EventRunner {
  private scopes = new Set<EffectScope>()
  private critical = new Set<CombatantId>()
  private scene: Scene
  constructor(scene: Scene) {
    this.scene = scene
  }
  private side(id: CombatantId, wire: RoomSnapshot) {
    return id.startsWith(wire.viewer) ? ('me' as const) : ('opponent' as const)
  }
  private element(id: CombatantId | null, wire: RoomSnapshot) {
    if (!id || wire.battle?.active[id.startsWith('p1') ? 'p1' : 'p2'] !== id) return null
    return this.scene.sprite(this.side(id, wire))
  }
  private fx(
    scope: EffectScope,
    parent: HTMLElement | null,
    id: SpriteClipId,
    size?: number,
    travelTo?: HTMLElement | null
  ) {
    const controller = new AbortController()
    scope.own(() => controller.abort())
    if (scope.cancelled) controller.abort()
    return playSprite(parent, id, {
      signal: controller.signal,
      size,
      travelTo,
      paused: () => scope.spritePaused,
    })
  }
  private text(scope: EffectScope, parent: HTMLElement | null, text: string, tone = 'damage') {
    if (!parent) return Promise.resolve()
    const label = document.createElement('span')
    label.className = `battle-float battle-float-${tone}`
    label.textContent = text
    label.setAttribute('aria-hidden', 'true')
    parent.appendChild(label)
    scope.own(() => label.remove())
    return scope.animate(
      label,
      [
        { opacity: 0, transform: 'translate(-50%, 4px) scale(.8)' },
        { opacity: 1, transform: 'translate(-50%, -14px) scale(1)', offset: 0.2 },
        { opacity: 0, transform: 'translate(-50%, -42px) scale(.95)' },
      ],
      { duration: IMPACT.text, easing: 'ease-out' }
    )
  }
  private hp(
    scope: EffectScope,
    event: Extract<CanonicalEvent, { type: 'damage' | 'heal' }>,
    wire: RoomSnapshot
  ) {
    if (wire.battle?.active[event.target.startsWith('p1') ? 'p1' : 'p2'] !== event.target)
      return Promise.resolve()
    const holder = this.scene
      .stage()
      ?.querySelector<HTMLElement>(`[data-hud-side="${this.side(event.target, wire)}"]`)
    const from = Math.max(0, Math.min(1, event.hpBefore / event.maxHp))
    const to = Math.max(0, Math.min(1, event.hpAfter / event.maxHp))
    const frames = [{ transform: `scaleX(${from})` }, { transform: `scaleX(${to})` }]
    return Promise.all([
      scope.animate(holder?.querySelector('[data-hp-fill]') ?? null, frames, {
        duration: IMPACT.hp,
        easing: 'ease-out',
        fill: 'forwards',
      }),
      scope.animate(holder?.querySelector('[data-hp-ghost]') ?? null, frames, {
        duration: IMPACT.ghost,
        delay: event.type === 'damage' ? IMPACT.ghostDelay : 0,
        easing: 'ease-out',
        fill: 'forwards',
      }),
    ]).then(() => undefined)
  }
  async run(
    event: CanonicalEvent,
    wire: RoomSnapshot,
    signal: AbortSignal,
    commit: () => void,
    next?: CanonicalEvent
  ) {
    if (signal.aborted) return
    const scope = new EffectScope(signal)
    this.scopes.add(scope)
    try {
      if (!this.scene.stage()) await scope.paint()
      if (scope.cancelled) return
      const reduced =
        this.scene.reducedMotion?.() ??
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      this.scene.sound?.(event, wire)
      if (!this.scene.stage() || reduced) {
        commit()
        return
      }
      const target = 'target' in event ? this.element(event.target, wire) : null
      switch (event.type) {
        case 'move': {
          this.critical.clear()
          if (isChargingMove(event, next)) break
          const actor = this.element(event.actor, wire)
          const clip = attackClip(event.moveId)
          const projectile = projectileMove(event.moveId)
          await Promise.all([
            clip
              ? this.fx(scope, actor, clip, undefined, projectile ? target : null)
              : Promise.resolve(),
            actor && !projectile && clip && event.target !== event.actor
              ? scope.lunge(actor, event.actor.startsWith(wire.viewer) ? 1 : -1)
              : Promise.resolve(),
          ])
          break
        }
        case 'critical':
          this.critical.add(event.target)
          break
        case 'damage':
        case 'heal': {
          const healing = event.type === 'heal'
          const pendingCrit = this.critical.delete(event.target)
          const crit =
            !healing &&
            Boolean(event.source) &&
            event.cause !== 'confusion' &&
            event.cause !== 'recoil' &&
            pendingCrit
          const shake =
            !healing && target
              ? scope.animate(
                  target,
                  [
                    { transform: 'translateX(0)' },
                    { transform: `translateX(${crit ? -8 : -4}px)`, offset: 0.2 },
                    { transform: `translateX(${crit ? 6 : 3}px)`, offset: 0.5 },
                    { transform: 'translateX(0)' },
                  ],
                  { duration: IMPACT.shake }
                )
              : Promise.resolve()
          const effects = [
            this.hp(scope, event, wire),
            shake,
            this.text(
              scope,
              target,
              `${healing ? '+' : '−'}${event.amount}${crit ? ' CRÍTICO!' : ''}`,
              healing ? 'heal' : crit ? 'critical' : 'damage'
            ),
            this.fx(
              scope,
              target,
              healing
                ? 'heal'
                : (majorClips[event.cause ?? ''] ?? attackClip(event.cause ?? '') ?? 'impact'),
              crit ? 185 : undefined
            ),
          ]
          if (!healing && target)
            await scope.hitStop(crit ? IMPACT.criticalHitStop : IMPACT.hitStop)
          await Promise.all(effects)
          break
        }
        case 'switch': {
          if (event.round === 0 && !event.previous) break
          const previous = this.element(event.previous, wire)
          await Promise.all([
            this.fx(scope, previous, 'recall'),
            scope.animate(
              previous,
              [
                { opacity: 1, transform: 'scale(1)' },
                { opacity: 0, transform: 'scale(.4)' },
              ],
              { duration: IMPACT.exit }
            ),
          ])
          if (scope.cancelled) return
          commit()
          await scope.paint()
          if (scope.cancelled) return
          const incoming = this.scene.sprite(this.side(event.target, wire))
          await Promise.all([
            this.fx(scope, incoming, 'summon'),
            scope.animate(
              incoming,
              [
                { opacity: 0, transform: 'translateY(10px) scale(.65)' },
                { opacity: 1, transform: 'translateY(0) scale(1)' },
              ],
              { duration: IMPACT.enter, easing: 'ease-out' }
            ),
          ])
          break
        }
        case 'faint':
          await Promise.all([
            this.fx(scope, target, 'faint'),
            scope.animate(
              target,
              [
                { opacity: 1, transform: 'translateY(0) rotate(0)' },
                { opacity: 0.24, transform: 'translateY(14px) rotate(-8deg)' },
              ],
              { duration: IMPACT.faint, easing: 'ease-in' }
            ),
          ])
          break
        case 'miss':
          await Promise.all([
            this.fx(scope, target, 'dodge'),
            scope.animate(
              target,
              [
                { transform: 'translateX(0)' },
                { transform: 'translateX(18px)', offset: 0.35 },
                { transform: 'translateX(0)' },
              ],
              { duration: 360 }
            ),
            this.text(scope, target, 'ESQUIVOU!', 'info'),
          ])
          break
        case 'immune':
        case 'super_effective':
        case 'resisted':
          await Promise.all([
            event.type === 'immune' ? this.fx(scope, target, 'protect') : Promise.resolve(),
            this.text(
              scope,
              target,
              {
                immune: 'NÃO AFETA!',
                super_effective: 'SUPER EFETIVO!',
                resisted: 'POUCO EFETIVO',
              }[event.type],
              'info'
            ),
          ])
          break
        case 'boost':
          await Promise.all([
            this.fx(scope, target, event.after > event.before ? 'buff' : 'debuff'),
            this.text(
              scope,
              target,
              `${event.after > event.before ? '↑' : '↓'} ${event.stat.toUpperCase()}`,
              'info'
            ),
          ])
          break
        case 'status':
          await this.fx(scope, target, majorClips[event.status ?? ''] ?? 'heal')
          break
        case 'unable': {
          const actor = this.element(event.actor, wire)
          await Promise.all([
            majorClips[event.reason]
              ? this.fx(scope, actor, majorClips[event.reason])
              : event.reason === 'recharge'
                ? this.fx(scope, actor, 'psychic', 90)
                : Promise.resolve(),
            this.text(scope, actor, 'NÃO CONSEGUIU AGIR', 'info'),
          ])
          break
        }
        case 'effect':
          if (event.effectId === 'substitute') this.critical.clear()
          if (event.operation === 'prepare') {
            await Promise.all([
              this.fx(scope, target, 'psychic', 100),
              this.text(scope, target, 'CARREGANDO', 'info'),
            ])
          } else if (event.operation === 'mustrecharge') {
            await this.fx(scope, target, 'psychic', 90)
          }
          if (
            event.operation === 'start' ||
            event.operation === 'singleturn' ||
            event.operation === 'activate'
          ) {
            const clip =
              event.effectId === 'confusion'
                ? 'confusion'
                : /protect|substitute|endure/.test(event.effectId ?? '')
                  ? 'protect'
                  : null
            if (clip) await this.fx(scope, target, clip)
          }
          break
        case 'battle_start':
          await Promise.all(
            ['me', 'opponent'].map((side) => {
              const sprite = this.scene.sprite(side as 'me' | 'opponent')
              return Promise.all([
                this.fx(scope, sprite, 'summon'),
                scope.animate(
                  sprite,
                  [
                    { opacity: 0, transform: 'translateY(14px) scale(.8)' },
                    { opacity: 1, transform: 'translateY(0) scale(1)' },
                  ],
                  { duration: IMPACT.enter }
                ),
              ])
            })
          )
          break
        case 'battle_end':
          await Promise.all(
            ['me', 'opponent'].map((side) =>
              this.fx(
                scope,
                this.scene.sprite(side as 'me' | 'opponent'),
                event.result.winner === null
                  ? 'draw'
                  : (event.result.winner === wire.viewer) === (side === 'me')
                    ? 'victory'
                    : 'defeat'
              )
            )
          )
          this.critical.clear()
          break
        case 'state_sync':
          this.critical.clear()
          break
        case 'round_start':
          this.critical.clear()
          break
        default:
          break
      }
      if (!scope.cancelled) commit()
    } finally {
      if (scope.cancelled) this.critical.clear()
      scope.dispose()
      this.scopes.delete(scope)
    }
  }
  dispose() {
    for (const scope of this.scopes) scope.dispose()
    this.scopes.clear()
    this.critical.clear()
  }
}
