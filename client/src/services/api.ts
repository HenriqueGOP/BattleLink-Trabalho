import type { PokemonSummary } from '../types/pokemon'

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3003'

/** Única chamada REST do app: catálogo de Pokémon servido pelo próprio servidor. */
export async function fetchCatalog(): Promise<PokemonSummary[]> {
  const response = await fetch(`${API_URL}/api/pokemon`)
  if (!response.ok) throw new Error(`Catálogo indisponível (${response.status}).`)
  const data = (await response.json()) as { pokemon: PokemonSummary[] }
  return data.pokemon
}
