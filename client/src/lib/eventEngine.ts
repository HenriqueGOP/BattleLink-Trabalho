import type { GameState } from '../types/battle'
import type { CanonicalEvent } from '../types/protocol'
import type { BattleEvent, BattleEventType, LogEntry, Side } from '../types/events'
import { eventMessage } from '../../../server/src/contracts/events'
import { statusNames } from './battleView'

const duration: Partial<Record<BattleEventType, number>> = {
  damage: 650,
  heal: 500,
  faint: 900,
  switch_in: 700,
  battle_start: 900,
  victory: 1500,
  defeat: 1500,
  draw: 1500,
  info: 180,
}
const sideOf = (id: string | null, myIndex: number): Side =>
  id ? (id.startsWith(myIndex === 0 ? 'p1' : 'p2') ? 'me' : 'opponent') : 'system'

/** Adaptação temporária ao diretor existente. Sem inferência de regras pelo texto. */
function animate(event: CanonicalEvent, state: GameState, myIndex: number): BattleEvent | null {
  if (event.type === 'state_sync') return null
  const output: BattleEvent = {
    id: event.sequence,
    type: 'info',
    actor: 'system',
    target: 'system',
    message: eventMessage(event, state.wire),
    duration: 180,
  }
  if ('actor' in event) output.actor = sideOf(event.actor, myIndex)
  if ('target' in event) output.target = sideOf(event.target, myIndex)
  switch (event.type) {
    case 'battle_start':
      output.type = 'battle_start'
      break
    case 'round_start':
      output.type = 'turn_change'
      break
    case 'move':
      output.move = event.moveId
      break
    case 'damage':
      output.type =
        event.cause === 'confusion' ? 'confusion_hit' : event.source ? 'damage' : 'residual'
      output.actor = sideOf(event.source, myIndex)
      output.amount = event.amount
      output.move = event.cause ?? undefined
      break
    case 'heal':
      output.type = 'heal'
      output.amount = event.amount
      break
    case 'critical':
      output.crit = true
      break
    case 'super_effective':
      output.type = 'effective'
      break
    case 'resisted':
    case 'immune':
    case 'miss':
    case 'faint':
      output.type = event.type
      break
    case 'hit_count':
      output.hits = event.hits
      break
    case 'switch':
      output.type = 'switch_in'
      output.pokemon = event.pokemon.speciesId
      break
    case 'status':
      output.type = event.status ? 'status_apply' : 'status_cure'
      output.status = event.status ? statusNames[event.status] : undefined
      break
    case 'boost':
      output.type = event.after > event.before ? 'stat_up' : 'stat_down'
      output.stat = event.stat
      output.amount = Math.abs(event.after - event.before)
      break
    case 'unable':
      if (event.reason === 'flinch') {
        output.type = 'flinch'
        output.target = output.actor
      }
      break
    case 'effect':
      if (event.effectId === 'confusion') {
        output.type = event.operation === 'end' ? 'status_cure' : 'status_apply'
        output.status = 'confusion'
      }
      break
    case 'battle_end':
      output.type =
        event.result.winner === null
          ? 'draw'
          : event.result.winner === state.wire.viewer
            ? 'victory'
            : 'defeat'
      break
  }
  output.duration = duration[output.type] ?? 450
  return output
}
export function diffState(
  previous: GameState | null,
  next: GameState,
  myIndex: number,
  _nextId?: () => number
): BattleEvent[] {
  if (
    !previous ||
    previous.wire.roomId !== next.wire.roomId ||
    next.phase === 'preparing' ||
    previous.wire.sequence < next.wire.eventFloor
  )
    return []
  const events = next.wire.events
    .filter((event) => event.sequence > previous.wire.sequence)
    .map((event) => animate(event, next, myIndex))
    .filter((event): event is BattleEvent => !!event)
  if (previous.phase === 'preparing' && next.phase === 'battle')
    events.unshift({
      id: 0,
      type: 'battle_start',
      actor: 'system',
      target: 'system',
      message: 'Batalha iniciada!',
      duration: 900,
    })
  return events
}
export function buildLogEntries(state: GameState, myIndex: number): LogEntry[] {
  const setup: LogEntry[] = state.wire.log.map((text, id) => ({
    id: -id - 1,
    text,
    category: 'info',
    side: 'system',
  }))
  const canonical = state.wire.events
    .map((event) => animate(event, state, myIndex))
    .filter((event): event is BattleEvent => !!event)
  return [
    ...setup,
    ...canonical.map((event) => ({
      id: event.id,
      text: event.message,
      side: event.target,
      category: (event.type === 'damage' || event.type === 'residual'
        ? 'damage'
        : event.type === 'heal'
          ? 'heal'
          : event.type === 'faint'
            ? 'faint'
            : 'info') as LogEntry['category'],
    })),
  ]
}
