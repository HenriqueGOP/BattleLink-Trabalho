import type { GameState } from './battle'

/** Protocolo pokemon-battle/1 — CONGELADO (docs/protocolo.md). */

export type ActionType = 'attack' | 'defend' | 'special'

export interface PlayerAction {
  type: ActionType
  move?: string
}

export type ClientMessage =
  | { type: 'join'; name: string }
  | { type: 'leave' }
  | { type: 'choose_pokemon'; pokemon: string }
  | { type: 'set_moves'; pokemon: string; moves: string[] }
  | { type: 'reset_team' }
  | { type: 'terastallize' }
  | { type: 'switch_pokemon'; pokemon: string }
  | { type: 'action'; action: PlayerAction }

export type ServerMessage =
  | { type: 'welcome'; playerId: string; protocol: string }
  | { type: 'waiting'; message: string }
  | { type: 'match_found'; roomId: string; state: GameState }
  | { type: 'state'; state: GameState }
  | { type: 'error'; code: string; message: string }
  | { type: 'opponent_left'; message: string }
