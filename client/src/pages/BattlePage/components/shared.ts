import type { Player } from '../../../types/player'
import type { StatusName } from '../../../types/player'

/** Resolve sprite (front/back, shiny) + se precisa espelhar. */
export function resolveSprite(
  player: Player | null | undefined,
  opponent: boolean,
): { src: string | null; mirrored: boolean } {
  const sprites = player?.pokemonData?.sprites
  const shiny = Boolean(player?.pokemonData?.isShiny)
  if (!sprites) return { src: null, mirrored: false }
  const front = shiny ? (sprites.shinyFront ?? sprites.front) : sprites.front
  const back = shiny ? (sprites.shinyBack ?? sprites.back) : sprites.back
  if (opponent) return { src: front ?? back ?? null, mirrored: !front && Boolean(back) }
  return { src: back ?? front ?? null, mirrored: !back && Boolean(front) }
}

export const STATUS_LABELS: Record<StatusName, string> = {
  burn: 'QUEIMADO',
  poison: 'ENVENENADO',
  bad_poison: 'TÓXICO+',
  paralysis: 'PARALISADO',
  sleep: 'DORMINDO',
  freeze: 'CONGELADO',
}

/** Siglas usadas na caixa de status dos jogos (BRN, PSN, PAR...). */
export const STATUS_SHORT: Record<StatusName, string> = {
  burn: 'BRN',
  poison: 'PSN',
  bad_poison: 'TOX',
  paralysis: 'PAR',
  sleep: 'SLP',
  freeze: 'FRZ',
}

export const STAT_SHORT: Record<string, string> = {
  attack: 'ATK',
  defense: 'DEF',
  specialAttack: 'SPA',
  specialDefense: 'SPD',
  speed: 'SPE',
  accuracy: 'ACC',
  evasion: 'EVA',
}

/** Nomes de status aceitos (inclui confusão volátil vinda de eventos). */
export const STATUS_TONE: Record<string, string> = {
  burn: 'burn',
  poison: 'poison',
  bad_poison: 'badPoison',
  paralysis: 'paralysis',
  sleep: 'sleep',
  freeze: 'freeze',
  confusion: 'confusion',
}
