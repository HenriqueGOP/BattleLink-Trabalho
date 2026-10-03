/** Modelo visual derivado do catálogo local de golpes. */
export interface PokemonMove {
  name: string
  displayName?: string
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

/** Entrada visual do catálogo empacotado, com recurso local validado. */
export interface PokemonSummary {
  id: number
  name: string
  image: string
}
