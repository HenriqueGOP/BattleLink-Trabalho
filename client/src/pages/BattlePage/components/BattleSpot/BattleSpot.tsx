import { memo } from 'react'
import { BattleSprite } from '../BattleSprite'
import { StatusAura } from '../StatusAura'
import styles from './BattleSpot.module.css'
import type { Player } from '../../../../types/player'
import { useMotionPreference } from '../../../../hooks/useMotionPreference'
import type { CSSProperties } from 'react'
import { SCENE_LAYOUT, spriteVisibleSize } from '../../../../lib/presentation/sceneLayout'
import { resolveBattleSprite } from '../../../../lib/assets'
import { visibleStatStages } from '../../../../lib/presentation/statStages'

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
  const stages = visibleStatStages(player?.pokemonData?.statStages, player?.pokemonData?.fainted)
  const image = resolveBattleSprite(player?.pokemon ?? '', opponent, Boolean(player?.pokemonData?.isShiny))
  const visible = spriteVisibleSize(image.staticSrc)
  return (
    <div
      className={`${styles.spot} ${opponent ? styles.opponent : styles.self}`}
      data-scene-side={opponent ? 'opponent' : 'me'}
      style={{ left: `${SCENE_LAYOUT[opponent ? 'opponent' : 'me'].x}%`, top: `${SCENE_LAYOUT[opponent ? 'opponent' : 'me'].y}%`, '--sprite-depth': SCENE_LAYOUT[opponent ? 'opponent' : 'me'].depth, '--sprite-visible-height': `${visible.height}%`, '--sprite-visible-width': `${visible.width}%` } as CSSProperties}
      data-urgent={urgent ? 'true' : undefined}
      data-motion-reduced={reduced ? 'true' : undefined}
      data-motion-paused={paused ? 'true' : undefined}
    >
      <div className={styles.actor}>
        <BattleSprite player={player} opponent={opponent} spriteRef={spriteRef} paused={paused} />
        <StatusAura
          key={player?.pokemonData?.id}
          status={status}
          confused={confused}
          side={opponent ? 'opponent' : 'me'}
          paused={paused}
        />
        {stages.length > 0 && <div className={styles.statStages} data-stat-stages={opponent ? 'opponent' : 'me'} aria-label={`Atributos de ${player?.pokemon}`}>
          {stages.map(stage => <span key={stage.stat} className={`${styles.statBadge} ${stage.positive ? styles.buff : styles.debuff}`} data-stat={stage.stat} data-stage={stage.value} title={`${stage.name}: ${stage.value > 0 ? '+' : ''}${stage.value}`}>
            <span aria-hidden="true">{stage.positive ? '↑' : '↓'}</span> {stage.short} {stage.value > 0 ? '+' : ''}{stage.value}
          </span>)}
        </div>}
      </div>
    </div>
  )
})
