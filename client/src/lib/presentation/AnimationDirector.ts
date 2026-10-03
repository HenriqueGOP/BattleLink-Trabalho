import gsap from 'gsap'
import type { CanonicalEvent, RoomSnapshot, CombatantId } from '../../types/protocol'
import type { EventRunner } from './BattleEventQueue'
import { IMPACT } from './impact'
import { playSprite, type SpriteOptions } from './SpriteRenderer'
import { attackClip, emissionClip, isChargingMove, type SpriteClipId } from './spriteRegistry'
import { actionVector, moveProfile, type MoveProfile } from './moveProfiles'
import { reducedMotion } from './motionPreference'

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
  lunge(element: HTMLElement, vector: { x: number; y: number }, profile: MoveProfile) {
    if (this.cancelled) return Promise.resolve()
    return new Promise<void>((resolve) => {
      const context = gsap.context(() => {
        gsap
          .timeline({ onComplete: resolve })
          .to(element, {
            x: -vector.x * 0.08,
            y: 3,
            scaleY: 0.96,
            duration: profile.anticipation / 1000,
          })
          .to(element, {
            x: vector.x,
            y: vector.y,
            scaleX: 1.035,
            scaleY: 1.015,
            duration: profile.travel / 1000,
            ease: 'power2.out',
          })
          .to(element, {
            x: 0,
            y: 0,
            scaleX: 1,
            scaleY: 1,
            duration: profile.recovery / 1000,
            ease: 'power2.inOut',
          })
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
  /** A referência é uma âncora estável; o corpo interno recebe deslocamentos. */
  private body(anchor: HTMLElement | null) {
    return anchor?.querySelector<HTMLElement>('[data-motion-action]') ?? anchor
  }
  private hold(scope: EffectScope, anchor: HTMLElement | null) {
    if (!anchor) return
    anchor.setAttribute('data-acting', 'true')
    scope.own(() => anchor.removeAttribute?.('data-acting'))
    // GIFs não obedecem animation-play-state; o PNG local congela a pose durante a ação.
    const creature = anchor.querySelector<HTMLImageElement>('[data-creature-sprite]')
    const original = creature?.getAttribute('src')
    const still = creature?.getAttribute('data-static-src')
    if (creature && original && still && original !== still) {
      const orientation = anchor.querySelector<HTMLElement>('[data-motion-orientation]')
      const priorOrientation = orientation?.style.transform ?? ''
      if (orientation)
        orientation.style.transform =
          orientation.getAttribute('data-static-mirrored') === 'true' ? 'scaleX(-1)' : 'scaleX(1)'
      creature.src = still
      scope.own(() => {
        if (creature.isConnected && creature.getAttribute('src') === still) {
          creature.src = original
          if (orientation?.isConnected) orientation.style.transform = priorOrientation
        }
      })
    }
  }
  private fx(
    scope: EffectScope,
    parent: HTMLElement | null,
    id: SpriteClipId,
    size?: number,
    travelTo?: HTMLElement | null,
    presentation?: SpriteOptions['presentation'],
    staticFrame = false
  ) {
    const controller = new AbortController()
    scope.own(() => controller.abort())
    if (scope.cancelled) controller.abort()
    return playSprite(parent, id, {
      signal: controller.signal,
      size,
      travelTo,
      presentation,
      static: staticFrame,
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
    let committed = false
    const confirm = () => {
      if (committed || scope.cancelled) return
      committed = true
      commit()
    }
    try {
      if (!this.scene.stage()) await scope.paint()
      if (scope.cancelled) return
      const reduced = this.scene.reducedMotion?.() ?? reducedMotion()
      this.scene.sound?.(event, wire)
      if (!this.scene.stage()) {
        confirm()
        return
      }
      const target = 'target' in event ? this.element(event.target, wire) : null
      if (reduced) {
        // Feedback legível e curto conserva os fatos sem tremores ou deslocamentos.
        const clip =
          event.type === 'status'
            ? (majorClips[event.status ?? ''] ?? 'heal')
            : event.type === 'boost'
              ? event.after > event.before
                ? 'buff'
                : 'debuff'
              : event.type === 'heal'
                ? 'heal'
                : event.type === 'damage'
                  ? (majorClips[event.cause ?? ''] ?? attackClip(event.cause ?? '') ?? 'impact')
                  : null
        if (clip && target) {
          const feedback = this.fx(scope, target, clip, 80, null, undefined, true)
          await scope.wait(120)
          confirm()
          scope.dispose()
          await feedback
        } else confirm()
        return
      }
      const targetBody = this.body(target)
      switch (event.type) {
        case 'move': {
          this.critical.clear()
          if (isChargingMove(event, next)) break
          const actor = this.element(event.actor, wire)
          const actorBody = this.body(actor)
          const profile = moveProfile(event.moveId)
          const clip = emissionClip(event.moveId)
          if (!profile) break
          this.hold(scope, actor)
          const contact =
            (profile.family === 'contact' || profile.family === 'slash') &&
            event.target !== event.actor
          const presentation: SpriteOptions['presentation'] =
            profile.family === 'projectile'
              ? 'orb'
              : profile.family === 'slash' || profile.family === 'status'
                ? 'contact'
                : profile.family
          const travelling =
            profile.family === 'projectile' ||
            profile.family === 'beam' ||
            profile.family === 'wave' ||
            profile.family === 'powder'
          const vector = actionVector(
            actor?.getBoundingClientRect?.() ?? null,
            target?.getBoundingClientRect?.() ?? null,
            event.actor.startsWith(wire.viewer) ? 1 : -1
          )
          await Promise.all([
            clip
              ? this.fx(
                  scope,
                  contact ? actorBody : actor,
                  clip,
                  profile.statusMove ? 100 : profile.size,
                  travelling && event.target !== event.actor ? target : null,
                  presentation
                )
              : Promise.resolve(),
            actorBody && contact
              ? scope.lunge(actorBody, vector, profile)
              : scope.animate(
                  actorBody,
                  [
                    { transform: 'translateY(0) scale(1)' },
                    { transform: 'translateY(3px) scale(.96, 1.02)', offset: 0.2 },
                    { transform: 'translateY(-5px) scale(1.03)', offset: 0.55 },
                    { transform: 'translateY(0) scale(1)' },
                  ],
                  {
                    duration: profile.anticipation + profile.travel + profile.recovery,
                    easing: 'ease-in-out',
                  }
                ),
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
            !healing && targetBody
              ? scope.animate(
                  targetBody,
                  [
                    { transform: 'translateX(0)' },
                    {
                      transform: `translate(${crit ? -11 : -6}px, 3px) rotate(-3deg) scaleY(.97)`,
                      offset: 0.2,
                    },
                    { transform: `translate(${crit ? 8 : 4}px, -2px) rotate(2deg)`, offset: 0.5 },
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
          this.hold(scope, target)
          if (!healing && target)
            await scope.hitStop(crit ? IMPACT.criticalHitStop : IMPACT.hitStop)
          await Promise.all(effects)
          break
        }
        case 'switch': {
          if (event.round === 0 && !event.previous) break
          const previous = this.element(event.previous, wire)
          const departed = [
            ...(wire.battle?.ownTeam ?? []),
            ...(wire.battle?.opponentTeam ?? []),
          ].find((pokemon) => pokemon.id === event.previous)
          const alreadyFainted = departed && !('hidden' in departed) && departed.fainted
          this.hold(scope, previous)
          if (!alreadyFainted)
            await Promise.all([
              this.fx(scope, previous, event.forced ? 'dodge' : 'recall'),
              scope.animate(
                this.body(previous),
                event.forced
                  ? [
                      { opacity: 1, transform: 'translateX(0)' },
                      {
                        opacity: 0,
                        transform: `translateX(${event.target.startsWith(wire.viewer) ? -90 : 90}px)`,
                      },
                    ]
                  : [
                      { opacity: 1, transform: 'scale(1)' },
                      { opacity: 0, transform: 'scale(.25)' },
                    ],
                { duration: IMPACT.exit, easing: 'ease-in' }
              ),
            ])
          if (scope.cancelled) return
          confirm()
          await scope.paint()
          if (scope.cancelled) return
          const incoming = this.scene.sprite(this.side(event.target, wire))
          this.hold(scope, incoming)
          await Promise.all([
            this.fx(scope, incoming, 'summon'),
            scope.animate(
              this.body(incoming),
              [
                { opacity: 0, transform: 'translateY(-10px) scale(.3)' },
                { opacity: 1, transform: 'translateY(4px) scale(1.05, .95)', offset: 0.75 },
                { opacity: 1, transform: 'translateY(0) scale(1)' },
              ],
              { duration: IMPACT.enter, easing: 'ease-out' }
            ),
          ])
          break
        }
        case 'faint':
          this.hold(scope, target)
          await Promise.all([
            this.fx(scope, target, 'faint'),
            scope.animate(
              targetBody,
              [
                { opacity: 1, transform: 'translateY(0) rotate(0)' },
                {
                  opacity: 0.6,
                  transform: 'translateY(10px) rotate(-5deg) scaleY(.93)',
                  offset: 0.35,
                },
                { opacity: 0, transform: 'translateY(52px) rotate(-7deg) scaleY(.85)' },
              ],
              { duration: IMPACT.faint, easing: 'ease-in' }
            ),
          ])
          break
        case 'miss':
          this.hold(scope, target)
          await Promise.all([
            this.fx(scope, target, 'dodge'),
            scope.animate(
              targetBody,
              [
                { transform: 'translateX(0)' },
                {
                  transform: `translateX(${event.target?.startsWith(wire.viewer) ? -24 : 24}px) rotate(-4deg)`,
                  offset: 0.35,
                },
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
          this.hold(scope, target)
          await Promise.all([
            this.fx(scope, target, event.after > event.before ? 'buff' : 'debuff'),
            this.text(
              scope,
              target,
              `${event.after > event.before ? '↑' : '↓'} ${event.stat.toUpperCase()}`,
              'info'
            ),
            scope.animate(
              targetBody,
              event.after > event.before
                ? [
                    { transform: 'translateY(0) scale(1)' },
                    { transform: 'translateY(-7px) scale(1.035)', offset: 0.45 },
                    { transform: 'translateY(0) scale(1)' },
                  ]
                : [
                    { transform: 'translateY(0) scale(1)' },
                    { transform: 'translateY(4px) scale(.96)', offset: 0.45 },
                    { transform: 'translateY(0) scale(1)' },
                  ],
              { duration: 460, easing: 'ease-in-out' }
            ),
          ])
          break
        case 'status':
          this.hold(scope, target)
          await Promise.all([
            this.fx(scope, target, majorClips[event.status ?? ''] ?? 'heal'),
            scope.animate(
              targetBody,
              event.status === 'slp'
                ? [
                    { transform: 'scale(1) rotate(0deg)' },
                    { transform: 'scaleY(.96) rotate(-3deg)' },
                  ]
                : event.status === 'par'
                  ? [
                      { transform: 'translateX(0)' },
                      { transform: 'translateX(-3px)', offset: 0.3 },
                      { transform: 'translateX(3px)', offset: 0.6 },
                      { transform: 'translateX(0)' },
                    ]
                  : [
                      { transform: 'translateY(0) scale(1)' },
                      { transform: 'translateY(3px) scale(.97)', offset: 0.4 },
                      { transform: 'translateY(0) scale(1)' },
                    ],
              { duration: 420, easing: 'ease-in-out' }
            ),
          ])
          break
        case 'unable': {
          const actor = this.element(event.actor, wire)
          this.hold(scope, actor)
          await Promise.all([
            majorClips[event.reason]
              ? this.fx(scope, actor, majorClips[event.reason])
              : event.reason === 'recharge'
                ? this.fx(scope, actor, 'psychic', 90)
                : Promise.resolve(),
            this.text(scope, actor, 'NÃO CONSEGUIU AGIR', 'info'),
            scope.animate(
              this.body(actor),
              [
                { transform: 'translateX(0) scale(1)' },
                {
                  transform: `translateX(${event.reason === 'par' ? -3 : 0}px) scaleY(.96)`,
                  offset: 0.35,
                },
                {
                  transform: `translateX(${event.reason === 'par' ? 3 : 0}px) scaleY(.98)`,
                  offset: 0.65,
                },
                { transform: 'translateX(0) scale(1)' },
              ],
              { duration: 440 }
            ),
          ])
          break
        }
        case 'effect':
          if (event.effectId === 'substitute') this.critical.clear()
          if (event.operation === 'prepare') {
            this.hold(scope, target)
            await Promise.all([
              this.fx(scope, target, 'psychic', 100),
              this.text(scope, target, 'CARREGANDO', 'info'),
              scope.animate(
                targetBody,
                [
                  { transform: 'translateY(0) scale(1)' },
                  { transform: 'translateY(-4px) scale(1.04)', offset: 0.5 },
                  { transform: 'translateY(0) scale(1)' },
                ],
                { duration: 620, easing: 'ease-in-out' }
              ),
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
              this.hold(scope, sprite)
              return Promise.all([
                this.fx(scope, sprite, 'summon'),
                scope.animate(
                  this.body(sprite),
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
            ['me', 'opponent'].map((side) => {
              const sprite = this.scene.sprite(side as 'me' | 'opponent')
              const winner =
                event.result.winner !== null &&
                (event.result.winner === wire.viewer) === (side === 'me')
              this.hold(scope, sprite)
              return Promise.all([
                this.fx(
                  scope,
                  sprite,
                  event.result.winner === null ? 'draw' : winner ? 'victory' : 'defeat'
                ),
                winner
                  ? scope.animate(
                      this.body(sprite),
                      [
                        { transform: 'translateY(0) scale(1)' },
                        { transform: 'translateY(-12px) scale(1.04)', offset: 0.4 },
                        { transform: 'translateY(0) scale(1)' },
                      ],
                      { duration: 520, easing: 'ease-in-out' }
                    )
                  : Promise.resolve(),
              ])
            })
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
      if (!scope.cancelled) confirm()
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
