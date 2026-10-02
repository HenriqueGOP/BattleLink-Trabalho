import type { PokemonSummary } from '../types/pokemon'
import { catalog } from '../lib/catalog'
import { pokemonAssets } from '../lib/assets'

/** Catálogo empacotado: inicia sem chamadas a serviços externos. */
export async function fetchCatalog(): Promise<PokemonSummary[]> {
  return catalog.species.map((species) => ({
    id: species.num,
    name: species.id,
    image: pokemonAssets(species.id).front,
  }))
}
