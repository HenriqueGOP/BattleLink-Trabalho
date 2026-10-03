import { memo } from 'react'
import { BattleSprite } from '../BattleSprite'
import { StatusAura } from '../StatusAura'
import styles from './BattleSpot.module.css'
import type { Player } from '../../../../types/player'
import { useMotionPreference } from '../../../../hooks/useMotionPreference'

export interface BattleSpotProps {
  player: Player | null
  opponent: boolean
  /** Ref do holder do sprite - alvo das animações GSAP (lunge/shake/etc). */
  spriteRef: React.RefObject<HTMLDivElement | null>
  /** Destaque quando pendingSwitch exige a troca. */
  urgent?: boolean
  paused?: boolean
}

/**
 * Ponto de batalha: círculo/plataforma e o Pokémon dentro do MESMO wrapper
 * posicionado. O alinhamento é estrutural (flex/grid interno) - não há
 * coordenadas manuais para sincronizar em resize, troca ou entrada.
 */
export const BattleSpot = memo(function BattleSpot({
  player,
  opponent,
  spriteRef,
  urgent = false,
  paused = false,
}: BattleSpotProps) {
  const { reduced } = useMotionPreference()
  const status = player?.pokemonData?.fainted ? null : (player?.pokemonData?.status ?? null)
  const confused = !player?.pokemonData?.fainted && (player?.pokemonData?.confusionTurns ?? 0) > 0
  return (
    <div
      className={`${styles.spot} ${opponent ? styles.opponent : styles.self}`}
      data-urgent={urgent ? 'true' : undefined}
      data-motion-reduced={reduced ? 'true' : undefined}
      data-motion-paused={paused ? 'true' : undefined}
    >
      <div className={styles.actor}>
        <BattleSprite player={player} opponent={opponent} spriteRef={spriteRef} paused={paused} />
        <StatusAura
          status={status}
          confused={confused}
          side={opponent ? 'opponent' : 'me'}
          paused={paused}
        />
      </div>
      <span className={styles.circle} aria-hidden="true" />
    </div>
  )
})
