import type { CanonicalEvent, RoomSnapshot, CombatantId } from '../../types/protocol'
import type { PublicPokemon, OwnPokemon } from '../../../../server/src/game/engine/battle-types'

export interface DamageTotals {
  dealt: number
  received: number
}
export interface Presentation {
  wire: RoomSnapshot | null
  activeEvent: CanonicalEvent | null
  busy: boolean
  hidden: boolean
  totals: DamageTotals
}
export interface EventRunner {
  run(
    event: CanonicalEvent,
    wire: RoomSnapshot,
    signal: AbortSignal,
    commit: () => void
  ): Promise<void>
}
type Job = { event: CanonicalEvent } | { checkpoint: RoomSnapshot }

/** Atualiza somente os fatos já apresentados; nunca interpreta mensagens de log. */
export function applyPresentedEvent(wire: RoomSnapshot, event: CanonicalEvent): RoomSnapshot {
  if (!wire.battle) return wire
  let battle = wire.battle
  const patch = (id: CombatantId, update: (pokemon: PublicPokemon) => PublicPokemon) => {
    battle = {
      ...battle,
      ownTeam: battle.ownTeam.map((pokemon) =>
        pokemon.id === id ? ({ ...pokemon, ...update(pokemon) } as OwnPokemon) : pokemon
      ),
      opponentTeam: battle.opponentTeam.map((pokemon) =>
        pokemon.id === id && !('hidden' in pokemon) ? update(pokemon) : pokemon
      ),
    }
  }
  switch (event.type) {
    case 'damage':
    case 'heal':
      patch(event.target, (pokemon) => ({ ...pokemon, hp: event.hpAfter, maxHp: event.maxHp }))
      break
    case 'faint':
      patch(event.target, (pokemon) => ({ ...pokemon, hp: 0, fainted: true }))
      break
    case 'status':
      patch(event.target, (pokemon) => ({ ...pokemon, status: event.status }))
      break
    case 'boost':
      patch(event.target, (pokemon) => ({
        ...pokemon,
        boosts: { ...pokemon.boosts, [event.stat]: event.after },
      }))
      break
    case 'switch': {
      const side = event.target.startsWith('p1') ? 'p1' : 'p2'
      battle = {
        ...battle,
        active: { ...battle.active, [side]: event.target },
        ownTeam: battle.ownTeam.map((pokemon) =>
          pokemon.id === event.target ? { ...pokemon, ...event.pokemon } : pokemon
        ),
        opponentTeam: battle.opponentTeam.map((pokemon) =>
          pokemon.id === event.target ? event.pokemon : pokemon
        ),
      }
      break
    }
    case 'effect':
      if (event.target && event.effectId) {
        const id = event.effectId
        if (event.operation === 'start' || event.operation === 'end')
          patch(event.target, (pokemon) => ({
            ...pokemon,
            volatiles:
              event.operation === 'end'
                ? pokemon.volatiles.filter((value) => value !== id)
                : [...new Set([...pokemon.volatiles, id])],
          }))
      }
      break
    case 'state_sync':
      for (const pokemon of event.active) patch(pokemon.id, () => pokemon)
      battle = {
        ...battle,
        sideConditions: event.sideConditions,
        fieldConditions: event.fieldConditions,
      }
      break
    case 'round_start':
      battle = { ...battle, round: event.number }
      break
    default:
      break
  }
  return {
    ...wire,
    battle,
    sequence: Math.max(wire.sequence, event.sequence),
    events: [...wire.events, event].filter((value) => value.sequence > wire.eventFloor).slice(-240),
  }
}

/** Fila sem DOM: conclusão real do runner controla o avanço, nunca um timer estimado. */
export class BattleEventQueue {
  private runner: EventRunner
  private listeners = new Set<() => void>()
  private jobs: Job[] = []
  private latest: RoomSnapshot | null = null
  private received = 0
  private generation = 0
  private running = false
  private controller: AbortController | null = null
  private disposed = false
  private value: Presentation = {
    wire: null,
    activeEvent: null,
    busy: false,
    hidden: false,
    totals: { dealt: 0, received: 0 },
  }

  constructor(runner: EventRunner) {
    this.runner = runner
  }
  activate() {
    this.disposed = false
  }
  getSnapshot = () => this.value
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private publish(update: Partial<Presentation>) {
    if (this.disposed) return
    this.value = { ...this.value, ...update }
    for (const listener of this.listeners) listener()
  }
  private cancel() {
    this.generation++
    this.controller?.abort()
    this.controller = null
    this.jobs = []
    this.running = false
  }
  ingest(next: RoomSnapshot | null) {
    if (this.disposed) return
    if (!next || this.latest?.roomId !== next.roomId) {
      this.cancel()
      this.latest = next
      this.received = next?.sequence ?? 0
      this.publish({
        wire: next,
        activeEvent: null,
        busy: false,
        totals: { dealt: 0, received: 0 },
      })
      return
    }
    if (next.sequence < this.received) return
    const previous = this.latest
    this.latest = next
    const events = next.events.filter((event) => event.sequence > this.received)
    const totals = { ...this.value.totals }
    const own = next.viewer
    for (const event of events)
      if (event.type === 'damage') {
        if (!event.target.startsWith(own) && event.source?.startsWith(own))
          totals.dealt += event.amount
        if (event.target.startsWith(own)) totals.received += event.amount
      }
    const gap = this.received < next.eventFloor
    this.received = next.sequence
    this.publish({ totals })
    if (gap || this.value.hidden || next.phase === 'setup' || next.phase === 'preparing') {
      this.skip()
      return
    }
    if (previous?.phase === 'preparing' && next.phase === 'battle') {
      // Preparação já contém os fatos iniciais e seu watermark. Usa essa cena,
      // sem antecipar dano de uma rodada que chegou antes do próximo render.
      this.publish({ wire: { ...previous, phase: 'battle', preparation: null } })
      this.jobs.push({
        event: {
          type: 'battle_start',
          sequence: 0,
          round: previous.battle?.round ?? 0,
          audience: 'public',
        },
      })
    }
    this.jobs.push(...events.map((event) => ({ event })), { checkpoint: next })
    void this.drain()
  }
  private async drain() {
    if (this.running || this.disposed) return
    this.running = true
    const generation = this.generation
    try {
      while (this.jobs.length && generation === this.generation && !this.disposed) {
        const job = this.jobs.shift()!
        if ('checkpoint' in job) {
          this.publish({ wire: job.checkpoint })
          continue
        }
        const wire = this.value.wire
        if (!wire) continue
        this.controller = new AbortController()
        let committed = false
        const commit = () => {
          if (committed || generation !== this.generation || this.disposed) return
          committed = true
          // A entrada visual sintética não duplica o histórico já recebido na preparação.
          if (job.event.sequence > 0)
            this.publish({ wire: applyPresentedEvent(this.value.wire!, job.event) })
        }
        this.publish({ activeEvent: job.event, busy: true })
        await this.runner.run(job.event, wire, this.controller.signal, commit)
        if (generation !== this.generation || this.disposed) return
        commit()
      }
    } catch (error) {
      if (generation !== this.generation || this.disposed) return
      console.error('Não foi possível apresentar o evento; estado ressincronizado.', error)
      this.skip()
    } finally {
      if (generation === this.generation && !this.disposed) {
        this.controller = null
        this.running = false
        this.publish({ activeEvent: null, busy: false })
      }
    }
  }
  skip = () => {
    this.cancel()
    this.publish({ wire: this.latest, activeEvent: null, busy: false })
  }
  setHidden(hidden: boolean) {
    this.publish({ hidden })
    if (hidden) this.skip()
  }
  dispose() {
    this.cancel()
    this.disposed = true
    this.listeners.clear()
  }
}
