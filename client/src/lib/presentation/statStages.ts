import type { StatKey, StatStages } from '../../types/player'

const labels: Readonly<Record<StatKey, readonly [string, string]>> = {
  attack: ['Atq', 'Ataque'], defense: ['Def', 'Defesa'],
  specialAttack: ['Atq. Esp', 'Ataque especial'], specialDefense: ['Def. Esp', 'Defesa especial'],
  speed: ['Vel', 'Velocidade'], accuracy: ['Prec', 'Precisão'], evasion: ['Esq', 'Evasão'],
}

/** Persistent indicators are derived from the presented engine state, never timers. */
export function visibleStatStages(stages: Partial<StatStages> | undefined, fainted = false) {
  if (!stages || fainted) return []
  return (Object.keys(labels) as StatKey[]).flatMap(stat => {
    const value = stages[stat] ?? 0
    if (value === 0) return []
    const [short, name] = labels[stat]
    return [{ stat, value, short, name, positive: value > 0 }]
  })
}
