import gsap from 'gsap'
import type { CanonicalEvent, RoomSnapshot, CombatantId } from '../../types/protocol'
import type { EventRunner } from './BattleEventQueue'
import { IMPACT, FlashBudget, visualRandom } from './impact'

interface Scene {
  stage: () => HTMLElement | null
  sprite: (side: 'me' | 'opponent') => HTMLElement | null
  sound?: (event: CanonicalEvent, wire: RoomSnapshot) => void
  reducedMotion?: () => boolean
}
const flashes = new FlashBudget()

/** Todas as promises e recursos de um evento têm o mesmo dono e o mesmo cancelamento. */
class EffectScope {
  private cleanups = new Set<() => void>()
  private stopped = false
  private animations = new Set<Animation>()
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
    if (this.signal.aborted) return Promise.resolve()
    return new Promise<void>((resolve) => {
      const timer = setTimeout(done, ms)
      const cancel = () => {
        clearTimeout(timer)
        done()
      }
      this.own(cancel)
      function done() {
        resolve()
      }
    })
  }
  paint() {
    if (this.signal.aborted) return Promise.resolve()
    return new Promise<void>((resolve) => {
      const frame = requestAnimationFrame(() => resolve())
      this.own(() => {
        cancelAnimationFrame(frame)
        resolve()
      })
    })
  }
  animate(element: HTMLElement | null, frames: Keyframe[], options: KeyframeAnimationOptions) {
    if (!element || !element.animate || this.cancelled) return Promise.resolve()
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
    for (const animation of this.animations) animation.pause()
    await this.wait(ms)
    if (!this.cancelled)
      for (const animation of this.animations)
        if (animation.playState === 'paused') animation.play()
  }
  lunge(element: HTMLElement, direction: number) {
    if (this.signal.aborted) return Promise.resolve()
    return new Promise<void>((resolve) => {
      const context = gsap.context(() => {
        const timeline = gsap.timeline({ onComplete: resolve })
        timeline
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

/** No máximo 24 nós reutilizáveis para partículas, independentemente do número de hits. */
class ParticlePool {
  private nodes: { element: HTMLElement; busy: boolean }[] = []
  take(parent: HTMLElement) {
    let slot = this.nodes.find((value) => !value.busy)
    if (!slot && this.nodes.length < IMPACT.particleLimit) {
      slot = { element: document.createElement('i'), busy: false }
      slot.element.className = 'battle-particle'
      slot.element.setAttribute('aria-hidden', 'true')
      this.nodes.push(slot)
    }
    if (!slot) return null
    slot.busy = true
    parent.appendChild(slot.element)
    const entry = slot
    let released = false
    return {
      element: entry.element,
      release: () => {
        // A promise de um efeito cancelado pode terminar depois da reutilização do nó.
        if (released) return
        released = true
        entry.element.remove()
        entry.busy = false
      },
    }
  }
  dispose() {
    for (const slot of this.nodes) slot.element.remove()
    this.nodes = []
  }
}

/** Único executor de efeitos finitos; sprites e HUDs não iniciam animações concorrentes. */
export class AnimationDirector implements EventRunner {
  private scene: Scene
  private pool = new ParticlePool()
  private scopes = new Set<EffectScope>()
  private critical = new Set<CombatantId>()
  constructor(scene: Scene) {
    this.scene = scene
  }
  private side(id: CombatantId, wire: RoomSnapshot) {
    return id.startsWith(wire.viewer) ? ('me' as const) : ('opponent' as const)
  }
  private element(id: CombatantId | null, wire: RoomSnapshot) {
    if (!id) return null
    const side = id.startsWith('p1') ? 'p1' : 'p2'
    // Um evento referente à reserva nunca atinge por engano o Pokémon ativo.
    if (wire.battle?.active[side] !== id) return null
    return this.scene.sprite(this.side(id, wire))
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
  private burst(
    scope: EffectScope,
    parent: HTMLElement | null,
    sequence: number,
    count: number,
    color: string,
    rise = false
  ) {
    if (!parent) return Promise.resolve()
    const random = visualRandom(sequence)
    const promises: Promise<void>[] = []
    for (let i = 0; i < Math.min(count, IMPACT.particleLimit); i++) {
      const slot = this.pool.take(parent)
      if (!slot) break
      scope.own(slot.release)
      slot.element.style.background = color
      const angle = rise ? -Math.PI / 2 + (random() - 0.5) : random() * Math.PI * 2
      const radius = 24 + random() * 38
      promises.push(
        scope
          .animate(
            slot.element,
            [
              { opacity: 0.8, transform: 'translate(0, 0) scale(.8)' },
              {
                opacity: 0,
                transform: `translate(${Math.cos(angle) * radius}px, ${Math.sin(angle) * radius}px) scale(.1)`,
              },
            ],
            { duration: 320 + random() * 120, easing: 'ease-out' }
          )
          .then(slot.release)
      )
    }
    return Promise.all(promises).then(() => undefined)
  }
  private flash(scope: EffectScope, target: HTMLElement | null, color: string) {
    if (!target || !flashes.allow(performance.now())) return Promise.resolve()
    const element = document.createElement('span')
    element.className = 'battle-impact'
    element.style.background = color
    target.appendChild(element)
    scope.own(() => element.remove())
    return scope.animate(
      element,
      [
        { opacity: 0.18, transform: 'scale(.75)' },
        { opacity: 0, transform: 'scale(1.25)' },
      ],
      { duration: IMPACT.flash }
    )
  }
  private hp(
    scope: EffectScope,
    event: Extract<CanonicalEvent, { type: 'damage' | 'heal' }>,
    wire: RoomSnapshot
  ) {
    const side = event.target.startsWith('p1') ? 'p1' : 'p2'
    if (wire.battle?.active[side] !== event.target) return Promise.resolve()
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
  async run(event: CanonicalEvent, wire: RoomSnapshot, signal: AbortSignal, commit: () => void) {
    if (signal.aborted) return
    const scope = new EffectScope(signal)
    this.scopes.add(scope)
    try {
      // Aguarda os refs da cena e a atualização React em trocas, sem temporizar a fila.
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
          const actor = this.element(event.actor, wire)
          if (actor && event.target !== event.actor)
            await scope.lunge(actor, event.actor.startsWith(wire.viewer) ? 1 : -1)
          break
        }
        case 'critical':
          this.critical.add(event.target)
          break
        case 'damage':
        case 'heal': {
          const crit = this.critical.delete(event.target)
          const healing = event.type === 'heal'
          // Hit-stop pausa somente as animações finitas deste impacto; CSS de idle continua.
          if (scope.cancelled) return
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
            this.burst(
              scope,
              target,
              event.sequence,
              crit ? IMPACT.criticalParticles : IMPACT.particles,
              healing ? '#5dd66b' : crit ? '#ffd94a' : '#ff855c',
              healing
            ),
            this.flash(scope, target, healing ? '#5dd66b' : '#ffffff'),
          ]
          if (!healing && target)
            await scope.hitStop(crit ? IMPACT.criticalHitStop : IMPACT.hitStop)
          await Promise.all(effects)
          break
        }
        case 'switch': {
          // O battle_start já anima os dois participantes da entrada inicial.
          if (event.round === 0 && !event.previous) break
          const previous = this.element(event.previous, wire)
          await scope.animate(
            previous,
            [
              { opacity: 1, transform: 'scale(1)' },
              { opacity: 0, transform: 'scale(.4)' },
            ],
            { duration: IMPACT.exit }
          )
          if (scope.cancelled) return
          commit() // saída concluída: substituição atômica; só então anima o novo sprite.
          await scope.paint()
          if (scope.cancelled) return
          const incoming = this.scene.sprite(this.side(event.target, wire))
          await Promise.all([
            scope.animate(
              incoming,
              [
                { opacity: 0, transform: 'translateY(10px) scale(.65)' },
                { opacity: 1, transform: 'translateY(0) scale(1)' },
              ],
              { duration: IMPACT.enter, easing: 'ease-out' }
            ),
            this.burst(scope, incoming, event.sequence, 12, '#ffd94a'),
          ])
          break
        }
        case 'faint':
          await scope.animate(
            target,
            [
              { opacity: 1, transform: 'translateY(0) rotate(0)' },
              { opacity: 0.24, transform: 'translateY(14px) rotate(-8deg)' },
            ],
            { duration: IMPACT.faint, easing: 'ease-in' }
          )
          break
        case 'miss':
        case 'immune':
        case 'super_effective':
        case 'resisted':
          await this.text(
            scope,
            target,
            {
              miss: 'ESQUIVOU!',
              immune: 'NÃO AFETA!',
              super_effective: 'SUPER EFETIVO!',
              resisted: 'POUCO EFETIVO',
            }[event.type],
            'info'
          )
          break
        case 'boost':
          await this.text(
            scope,
            target,
            `${event.after > event.before ? '↑' : '↓'} ${event.stat.toUpperCase()}`,
            'info'
          )
          break
        case 'status':
          await this.burst(
            scope,
            target,
            event.sequence,
            6,
            event.status ? '#b48cff' : '#5dd66b',
            true
          )
          break
        case 'unable':
          await this.text(scope, this.element(event.actor, wire), 'NÃO CONSEGUIU AGIR', 'info')
          break
        case 'battle_start':
          await Promise.all(
            ['me', 'opponent'].map((side) =>
              scope.animate(
                this.scene.sprite(side as 'me' | 'opponent'),
                [
                  { opacity: 0, transform: 'translateY(14px) scale(.8)' },
                  { opacity: 1, transform: 'translateY(0) scale(1)' },
                ],
                { duration: IMPACT.enter }
              )
            )
          )
          break
        case 'battle_end': {
          const winner = event.result.winner
          if (winner)
            await this.burst(
              scope,
              this.scene.sprite(winner === wire.viewer ? 'me' : 'opponent'),
              event.sequence,
              IMPACT.particleLimit,
              '#ffd94a',
              true
            )
          this.critical.clear()
          break
        }
        case 'state_sync':
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
    this.pool.dispose()
  }
}
