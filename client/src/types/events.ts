/** Eventos derivados do diff entre snapshots — alimentam animação (GSAP), som e log. */

export type Side = 'me' | 'opponent' | 'system'

export type BattleEventType =
  | 'battle_start'
  | 'turn_change'
  | 'damage'
  | 'special'
  | 'confusion_hit'
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
  | 'weather_change'
  | 'terrain_change'
  | 'victory'
  | 'defeat'
  | 'draw'
  | 'substitute_needed'
  | 'opponent_left'
  | 'info'

export interface BattleEvent {
  id: number
  type: BattleEventType
  /** Quem provocou o evento. */
  actor: Side
  /** Quem sofre o efeito visual (alvo da animação). */
  target: Side
  message: string
  /** Dano causado ou HP curado (positivo). */
  amount?: number
  move?: string
  crit?: boolean
  hits?: number
  status?: string
  stat?: string
  pokemon?: string
  /** Duração sugerida da animação (ms) antes do próximo evento da fila. */
  duration: number
}

export type LogCategory =
  | 'damage'
  | 'heal'
  | 'status'
  | 'stat'
  | 'switch'
  | 'faint'
  | 'miss'
  | 'field'
  | 'result'
  | 'info'

/** Entrada do log já classificada para o painel de combate. */
export interface LogEntry {
  id: number
  text: string
  category: LogCategory
  side: Side
}
