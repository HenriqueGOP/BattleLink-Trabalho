import { memo } from 'react'
import { BattleSprite } from '../BattleSprite'
import styles from './PlayerPokemon.module.css'
import type { Player } from '../../../../types/player'

export interface PlayerPokemonProps {
  player: Player | null
  /** Ref do holder do sprite — alvo das animações GSAP. */
  spriteRef: React.RefObject<HTMLDivElement | null>
}

/** Lado jogador: sprite de costas na base-esquerda com sombra elíptica. */
export const PlayerPokemon = memo(function PlayerPokemon({ player, spriteRef }: PlayerPokemonProps) {
  return (
    <div className={styles.stageSpot}>
      <div className={styles.actor}>
        <BattleSprite player={player} opponent={false} spriteRef={spriteRef} />
        <span className={styles.shadow} aria-hidden="true" />
      </div>
      <p className={styles.caption}>{player?.pokemon ?? 'aguardando…'}</p>
    </div>
  )
})
