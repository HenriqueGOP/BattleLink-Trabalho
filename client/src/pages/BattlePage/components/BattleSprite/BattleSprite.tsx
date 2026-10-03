import { useState } from 'react'
import { resolveSprite } from '../shared'
import styles from './BattleSprite.module.css'
import type { Player } from '../../../../types/player'

export interface BattleSpriteProps {
  player: Player | null
  opponent: boolean
  /** Ref de referência para as animações de evento (GSAP). */
  spriteRef: React.RefObject<HTMLDivElement | null>
}

/** Sprite local em campo: entrada, sombra e brilho shiny. */
export function BattleSprite({ player, opponent, spriteRef }: BattleSpriteProps) {
  const { src, mirrored } = resolveSprite(player, opponent)
  // Falhas do recurso local usam um placeholder sem esticar texto sobre a arena.
  // Guardar o src permite recuperar naturalmente quando o Pokémon troca.
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const broken = src !== null && failedSrc === src

  // A flag apresentada muda após o evento faint; HP zero não antecipa a queda.
  // A pose persiste até a troca, inclusive após cancelamento ou ressincronização.
  const fainted = Boolean(player?.pokemonData?.fainted)

  const imgClasses = [styles.sprite, mirrored ? styles.mirrored : ''].filter(Boolean).join(' ')

  return (
    <div
      ref={spriteRef}
      className={`${styles.holder} ${fainted ? styles.fainted : ''}`}
      data-pokemon={player?.pokemon ?? undefined}
      data-fainted={fainted ? 'true' : undefined}
    >
      {src && !broken ? (
        <img
          key={src}
          className={imgClasses}
          src={src}
          /* alt vazio + role de apresentacao: o nome ja aparece no HUD e na
             legenda, e um alt longo virava texto solto quando a imagem falhava */
          alt=""
          width={96}
          height={96}
          loading="eager"
          decoding="async"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <span
          className={styles.placeholder}
          role="img"
          aria-label={
            player?.pokemon ? `${player.pokemon} (sprite indisponível)` : 'Pokémon em campo'
          }
        />
      )}
      {player?.pokemonData?.isShiny && (
        <span className={styles.sparkle} role="img" aria-label="Pokémon shiny" />
      )}
    </div>
  )
}
