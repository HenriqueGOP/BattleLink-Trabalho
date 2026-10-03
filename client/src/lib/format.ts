import { speciesById } from './catalog'

/** Display names never replace the canonical IDs sent to the server. */
export function formatPokemonName(id: string): string {
  return (
    speciesById(id)?.name ??
    id
      .replace(/[-_]+/g, ' ')
      .replace(/(^|\s)\p{L}/gu, (letter) => letter.toLocaleUpperCase('pt-BR'))
  )
}

const types: Record<string, string> = {
  normal: 'Normal',
  fire: 'Fogo',
  water: 'Água',
  electric: 'Elétrico',
  grass: 'Planta',
  ice: 'Gelo',
  fighting: 'Lutador',
  poison: 'Veneno',
  ground: 'Terra',
  flying: 'Voador',
  psychic: 'Psíquico',
  bug: 'Inseto',
  rock: 'Pedra',
  ghost: 'Fantasma',
  dragon: 'Dragão',
  dark: 'Sombrio',
  steel: 'Aço',
  fairy: 'Fada',
  stellar: 'Estelar',
}

export const typeLabel = (type: string): string => types[type.toLowerCase()] ?? type

export function categoryLabel(category: string | null | undefined): string {
  if (category?.toLowerCase() === 'physical') return 'Físico'
  if (category?.toLowerCase() === 'special') return 'Especial'
  if (category?.toLowerCase() === 'status') return 'Status'
  return '—'
}

export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/** A number finds its exact Dex entry; names accept accents and punctuation. */
export function matchesPokemonSearch(
  pokemon: Readonly<{ id: number; name: string }>,
  query: string
): boolean {
  const term = normalizeSearch(query)
  if (!term) return true
  if (/^\s*#?\s*\d+\s*$/.test(query)) return pokemon.id === Number(term)
  return (
    normalizeSearch(pokemon.name).includes(term) ||
    normalizeSearch(formatPokemonName(pokemon.name)).includes(term)
  )
}
