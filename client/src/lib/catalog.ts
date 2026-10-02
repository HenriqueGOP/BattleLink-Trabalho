import { catalog, moveById, speciesById } from '../../../server/src/contracts/catalog'
import type { PokemonMove } from '../types/pokemon'
export { catalog, moveById, speciesById }

const reasons: Record<string, string> = {
  items: 'exige itens',
  abilities: 'exige outras habilidades',
  weather: 'exige clima',
  terrain: 'exige terreno',
  hazards: 'cria armadilhas',
  forms: 'exige forma alternativa',
  zmove: 'Z-Move desativado',
  dynamax: 'Dynamax desativado',
  nonstandard: 'fora do formato',
  alias: 'ID alternativo',
}
const statuses: Record<string, string> = {
  brn: 'burn',
  psn: 'poison',
  tox: 'bad_poison',
  par: 'paralysis',
  slp: 'sleep',
  frz: 'freeze',
}
const stats: Record<string, string> = {
  atk: 'attack',
  def: 'defense',
  spa: 'specialAttack',
  spd: 'specialDefense',
  spe: 'speed',
  accuracy: 'accuracy',
  evasion: 'evasion',
}
const changes = (boosts: Readonly<Record<string, number>> | undefined) =>
  Object.entries(boosts ?? {}).map(([stat, change]) => ({ stat: stats[stat], change }))
export function displayMove(id: string): PokemonMove {
  const move = moveById(id)
  if (!move)
    return {
      name: id,
      displayName: id === 'recharge' ? 'Recarregar' : 'Indisponível',
      type: 'normal',
      category: 'status',
      power: null,
      accuracy: null,
      pp: 0,
    }
  const statusEffect = move.secondaries.find(
    (effect) => effect.target === 'target' && (effect.status || effect.volatile === 'confusion')
  )
  const boostEffect = move.secondaries.find((effect) => effect.target === 'target' && effect.boosts)
  const ailment =
    move.status ??
    (move.volatile === 'confusion' ? 'confusion' : undefined) ??
    statusEffect?.status ??
    statusEffect?.volatile
  return {
    name: id,
    displayName: move.name,
    power: move.basePower || null,
    accuracy: move.accuracy === true ? null : move.accuracy,
    pp: move.pp,
    type: move.type,
    category: move.category.toLowerCase(),
    priority: move.priority,
    critRate: Math.max(0, move.critRatio - 1),
    target: move.target,
    ailment: ailment ? (statuses[ailment] ?? ailment) : undefined,
    ailmentChance: move.status || move.volatile === 'confusion' ? 100 : statusEffect?.chance,
    statChanges: changes(move.boosts ?? boostEffect?.boosts),
    statChance: move.boosts ? 100 : boostEffect?.chance,
    selfStatChanges: changes(move.selfBoosts),
    flinchChance: move.secondaries.find((effect) => effect.volatile === 'flinch')?.chance,
    minHits: move.multihit?.[0],
    maxHits: move.multihit?.[1],
    description: move.description,
    unsupported: move.support.supported
      ? []
      : move.support.reasons.map((reason) => reasons[reason]),
    drain: move.drain
      ? (move.drain[0] / move.drain[1]) * 100
      : move.recoil
        ? (-move.recoil[0] / move.recoil[1]) * 100
        : 0,
    healing: move.heal ? (move.heal[0] / move.heal[1]) * 100 : 0,
  }
}
