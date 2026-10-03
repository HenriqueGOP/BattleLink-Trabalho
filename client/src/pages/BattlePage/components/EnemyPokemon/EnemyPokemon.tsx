import { memo } from 'react'
import { BattleSprite } from '../BattleSprite'
import styles from './EnemyPokemon.module.css'
import type { Player } from '../../../../types/player'

export interface EnemyPokemonProps {
  player: Player | null
  /** Ref do holder do sprite — alvo das animações GSAP. */
  spriteRef: React.RefObject<HTMLDivElement | null>
}

/** Lado oponente: sprite frontal no topo-direita com sombra elíptica. */
export const EnemyPokemon = memo(function EnemyPokemon({ player, spriteRef }: EnemyPokemonProps) {
  return (
    <div className={styles.stageSpot}>
      <div className={styles.actor}>
        <BattleSprite player={player} opponent spriteRef={spriteRef} />
        <span className={styles.shadow} aria-hidden="true" />
      </div>
      <p className={styles.caption}>{player?.pokemon ?? 'aguardando…'}</p>
    </div>
  )
})
