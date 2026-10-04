import { memo } from 'react'
import { BattleSprite } from '../BattleSprite'
import { StatusAura } from '../StatusAura'
import styles from './BattleSpot.module.css'
import type { Player } from '../../../../types/player'
import { useMotionPreference } from '../../../../hooks/useMotionPreference'
import type { CSSProperties } from 'react'
import { SCENE_LAYOUT, spriteMetrics } from '../../../../lib/presentation/sceneLayout'
import { resolveBattleSprite } from '../../../../lib/assets'

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
 * Actor coordinates and depth are shared with effects. HP cards are independent;
 * the visible feet stay at the same arena point across image variants.
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
  const image = resolveBattleSprite(player?.pokemon ?? '', opponent, Boolean(player?.pokemonData?.isShiny))
  const metrics = spriteMetrics(image.staticSrc)
  const bounds = metrics.bounds
  const visibleHeight = (bounds[3] - bounds[1]) * 100 / Math.max(metrics.width, metrics.height)
  const visibleWidth = (bounds[2] - bounds[0]) * 100 / Math.max(metrics.width, metrics.height)
  return (
    <div
      className={`${styles.spot} ${opponent ? styles.opponent : styles.self}`}
      data-scene-side={opponent ? 'opponent' : 'me'}
      style={{ left: `${SCENE_LAYOUT[opponent ? 'opponent' : 'me'].x}%`, top: `${SCENE_LAYOUT[opponent ? 'opponent' : 'me'].y}%`, '--sprite-depth': SCENE_LAYOUT[opponent ? 'opponent' : 'me'].depth, '--sprite-visible-height': `${visibleHeight}%`, '--sprite-visible-width': `${visibleWidth}%` } as CSSProperties}
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
    </div>
  )
})
