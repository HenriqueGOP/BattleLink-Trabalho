import type { PokemonMove } from './pokemon'

export interface PokemonSprites {
  front: string | null
  back: string | null
  shinyFront: string | null
  shinyBack: string | null
}

export interface PokemonCries {
  latest: string | null
  legacy: string | null
}

export type StatKey =
  'attack' | 'defense' | 'specialAttack' | 'specialDefense' | 'speed' | 'accuracy' | 'evasion'

export type StatStages = Record<StatKey, number>

export type StatusName = 'burn' | 'poison' | 'bad_poison' | 'paralysis' | 'sleep' | 'freeze'

/** Membro da equipe no snapshot (server TeamMemberState). */
export interface TeamMember {
  id: import('./protocol').CombatantId
  pokemon: string
  types: string[]
  image: string | null
  abilities: string[]
  moves: PokemonMove[]
  selectedMoves: string[]
  maxHp: number
  hp: number
  status: StatusName | null
  isShiny: boolean
  sleepTurns: number
  pp: Record<string, number>
}

/** Dados do Pokémon ativo no snapshot (server ActivePokemonData). */
export interface ActivePokemonData {
  moves: PokemonMove[]
  selectedMoves: string[]
  types: string[]
  status: StatusName | null
  isShiny: boolean
  statStages: StatStages
  confusionTurns: number
  pp: Record<string, number>
  cries: PokemonCries
  sprites: PokemonSprites
  level: number
}

/** Jogador no snapshot (server PlayerState). */
export interface Player {
  ready: boolean
  id: string
  name: string
  pokemon: string | null
  hp: number
  maxHp: number
  team: TeamMember[]
  pokemonData?: ActivePokemonData
}
