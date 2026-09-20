/** Golpe exatamente como o servidor envia (server/src/game/pokeapi.ts MoveData). */
export interface PokemonMove {
  name: string
  power: number | null
  accuracy: number | null
  pp: number | null
  type: string
  category: string | null
  target?: string | null
  priority?: number
  critRate?: number
  minHits?: number | null
  maxHits?: number | null
  drain?: number
  flinchChance?: number
  healing?: number
  statChance?: number
  description?: string | null
  unsupported?: string[]
  selfStatChanges?: Array<{ stat: string; change: number }>
  ailment?: string
  ailmentChance?: number
  statChanges?: Array<{ stat: string; change: number }>
  metaCategory?: string | null
}

/** Entrada do catálogo REST GET /api/pokemon (servidor, index.ts). */
export interface PokemonSummary {
  id: number
  name: string
  image: string
}
