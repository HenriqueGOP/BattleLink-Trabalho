import type { Player } from './player'
import type { RoomSnapshot, GamePhase, ArenaId } from '../../../server/src/contracts/protocol'
export type { GamePhase }
export type BackgroundId = ArenaId
export type Weather = 'rain' | 'sun' | 'sandstorm' | 'snow'
export type Terrain = 'electric' | 'grassy' | 'misty' | 'psychic'

/** Modelo de apresentação local. O contrato de rede fica em wire. */
export interface GameState {
  wire: RoomSnapshot
  phase: GamePhase
  players: [Player, Player]
  field: { weather: Weather | null; terrain: Terrain | null; background: BackgroundId }
  log: string[]
  winner: string | null
  finishReason: NonNullable<RoomSnapshot['result']>['reason'] | null
}
