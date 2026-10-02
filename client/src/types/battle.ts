import type { Player } from './player'

export type GamePhase = 'setup' | 'battle' | 'finished'
export type Weather = 'rain' | 'sun' | 'sandstorm' | 'snow'
export type Terrain = 'electric' | 'grassy' | 'misty' | 'psychic'

export interface FieldHazards {
  stealthRock: boolean
  spikes: number
}

export type BackgroundId = 'meadow' | 'forest' | 'cave' | 'night' | 'beach' | 'city'
export type BattleEventType =
  | 'battle_start'
  | 'turn_change'
  | 'damage'
  | 'miss'
  | 'immune'
  | 'effective'
  | 'resisted'
  | 'heal'
  | 'stat_up'
  | 'stat_down'
  | 'status_apply'
  | 'status_cure'
  | 'flinch'
  | 'residual'
  | 'faint'
  | 'switch_in'
  | 'tera'
  | 'substitute_needed'
  | 'victory'
  | 'defeat'
  | 'draw'

export interface ServerBattleEvent {
  id: number
  type: BattleEventType
  message: string
  actorId?: string
  targetId?: string
  pokemon?: string
  amount?: number
  move?: string
  crit?: boolean
  hits?: number
  status?: string
  stat?: string
}

export interface FieldState {
  weather: Weather | null
  terrain: Terrain | null
  /** Cenário sorteado pelo servidor no início da batalha (registro: src/config/battleBackgrounds). */
  background: BackgroundId | null
  hazards: [FieldHazards, FieldHazards]
}

/** Snapshot oficial — o servidor envia o estado completo a cada mensagem `state`. */
export interface GameState {
  phase: GamePhase
  players: [Player, Player]
  turn: 0 | 1
  pendingSwitch: [boolean, boolean]
  field: FieldState
  log: string[]
  /** Número de linhas descartadas pelo servidor antes deste recorte de log. */
  logOffset: number
  events: ServerBattleEvent[]
  winner: string | null
  finishReason: 'knockout' | 'disconnect' | null
}
