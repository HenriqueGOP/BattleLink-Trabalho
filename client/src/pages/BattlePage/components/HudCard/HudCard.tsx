import { memo } from 'react'
import { HealthBar } from '../../../../components/HealthBar'
import { TypeBadge } from '../../../../components/TypeBadge'
import { STAT_SHORT, STATUS_LABELS, STATUS_SHORT } from '../shared'
import styles from './HudCard.module.css'
import type { Player } from '../../../../types/player'

export interface HudCardProps {
  player: Player | null
  opponent: boolean
}

/** Nível padrão do formato; o snapshot informa o nível efetivo. */
const BATTLE_LEVEL = 50

/** Fileira de pokébolas: cheia = disponível, vazia = nocauteada, aro = em campo. */
function PartyBalls({ player }: { player: Player | null }) {
  const team = player?.team ?? []
  if (team.length === 0) return null
  return (
    <span
      className={styles.balls}
      aria-label={`${team.filter((m) => m.hp > 0).length} de ${team.length} Pokémon em condições de lutar`}
    >
      {team.map((member, index) => (
        <i
          key={`${index}-${member.pokemon}`}
          className={[
            styles.ball,
            member.hp <= 0 ? styles.ballFainted : '',
            member.pokemon === player?.pokemon ? styles.ballActive : '',
          ]
            .filter(Boolean)
            .join(' ')}
        />
      ))}
    </span>
  )
}

/**
 * Caixa de status da batalha, no formato da série: nome + Lv em cima,
 * barra de HP, contador numérico só do lado do jogador, condição de status
 * como etiqueta colorida e a fileira de pokébolas da equipe.
 */
export const HudCard = memo(function HudCard({ player, opponent }: HudCardProps) {
  const data = player?.pokemonData
  const activeTypes =
    data?.types ?? player?.team.find((member) => member.pokemon === player.pokemon)?.types ?? []
  const stages = data?.statStages
  const activeStages = stages ? Object.entries(stages).filter(([, value]) => value !== 0) : []
  const status = data?.status

  return (
    <article className={opponent ? `${styles.card} ${styles.opponent}` : styles.card}>
      <header className={styles.trainerRow}>
        <span className={styles.role}>{opponent ? 'OPONENTE' : 'VOCÊ'}</span>
        <span className={styles.trainer}>{player?.name ?? '-'}</span>
        <PartyBalls player={player} />
      </header>

      <div className={styles.nameRow}>
        <h3 className={styles.pokemonName}>
          {player?.pokemon ?? '-'}
          {data?.isShiny && (
            <span className={styles.shiny} title="Shiny!">
              ★
            </span>
          )}
        </h3>
        <span className={styles.level}>Lv{data?.level ?? BATTLE_LEVEL}</span>
      </div>

      <HealthBar
        value={player?.hp ?? 0}
        max={player?.maxHp ?? 0}
        label={opponent ? undefined : 'hp'}
        compact={opponent}
      />

      <div className={styles.tags}>
        {status && (
          <span className={`${styles.status} ${styles[status]}`} title={STATUS_LABELS[status]}>
            {STATUS_SHORT[status]}
          </span>
        )}
        {activeTypes.map((type) => (
          <TypeBadge key={type} type={type} small />
        ))}
        {activeStages.map(([stat, value]) => (
          <span
            key={stat}
            className={
              value > 0 ? `${styles.stage} ${styles.up}` : `${styles.stage} ${styles.down}`
            }
          >
            {value > 0 ? '▲' : '▼'}
            {STAT_SHORT[stat] ?? stat}
            {value > 0 ? '+' : ''}
            {value}
          </span>
        ))}
      </div>
    </article>
  )
})
