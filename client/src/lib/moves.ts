import type { PokemonMove } from '../types/pokemon'

export const STAT_NAMES: Record<string, string> = {
  attack: 'Ataque',
  defense: 'Defesa',
  specialAttack: 'Ataque Especial',
  specialDefense: 'Defesa Especial',
  speed: 'Velocidade',
  accuracy: 'Precisão',
  evasion: 'Evasão',
}

const AILMENT_NAMES: Record<string, string> = {
  burn: 'Queimadura',
  poison: 'Veneno',
  bad_poison: 'Veneno grave',
  paralysis: 'Paralisia',
  sleep: 'Sono',
  freeze: 'Congelamento',
  confusion: 'Confusão',
}

export type EffectTone = 'heal' | 'ailment' | 'buff' | 'debuff' | 'info'

export interface MoveEffect {
  label: string
  tone: EffectTone
}

/** Resumo genérico do que o golpe faz — sem números de regra, em português.
 *  Cálculo permanece no servidor; isto é só descrição do catálogo. */
export function moveEffects(move: PokemonMove): MoveEffect[] {
  const effects: MoveEffect[] = []
  const selfTarget = move.target === 'self' || move.target === 'user' || move.target === 'allySide'
  const maybe = (move.statChance ?? 100) < 100 ? 'Pode ' : ''

  if ((move.healing ?? 0) > 0) effects.push({ label: 'Recupera HP', tone: 'heal' })
  if ((move.drain ?? 0) > 0) effects.push({ label: 'Drena HP do alvo', tone: 'heal' })

  const ailment =
    move.ailment && move.ailment !== 'none' ? (AILMENT_NAMES[move.ailment] ?? move.ailment) : null
  if (ailment) {
    const sure = (move.ailmentChance ?? 0) >= 100
    effects.push({ label: sure ? `Causa ${ailment}` : `Pode causar ${ailment}`, tone: 'ailment' })
  }
  for (const change of move.statChanges ?? []) {
    const stat = STAT_NAMES[change.stat] ?? change.stat
    const verb = change.change > 0 ? 'Aumenta' : 'Reduz'
    effects.push({
      label: selfTarget ? `${maybe}${verb} ${stat}` : `${maybe}${verb} ${stat} do oponente`,
      tone: change.change > 0 ? 'buff' : 'debuff',
    })
  }
  for (const change of move.selfStatChanges ?? []) {
    const stat = STAT_NAMES[change.stat] ?? change.stat
    effects.push({
      label: `${change.change > 0 ? 'Aumenta' : 'Reduz'} ${stat} próprio`,
      tone: change.change > 0 ? 'buff' : 'debuff',
    })
  }
  if ((move.flinchChance ?? 0) > 0) effects.push({ label: 'Pode fazer vacilar', tone: 'info' })
  if ((move.minHits ?? 1) > 1 || (move.maxHits ?? 1) > 1)
    effects.push({ label: 'Golpe múltiplo', tone: 'info' })
  if ((move.priority ?? 0) > 0) effects.push({ label: 'Age primeiro', tone: 'info' })
  if ((move.priority ?? 0) < 0) effects.push({ label: 'Age por último', tone: 'info' })
  if ((move.critRate ?? 0) > 0) effects.push({ label: 'Maior chance de crítico', tone: 'info' })
  if (effects.length === 0) {
    effects.push({ label: move.power == null ? 'Golpe de status' : 'Causa dano', tone: 'info' })
  }
  return effects
}
