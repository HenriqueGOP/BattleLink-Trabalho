import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { burstParticles, enterSprite } from '../../../../lib/anim/gsap'
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
  const previousSrc = useRef<string | null>(null)
  // Falhas do recurso local usam um placeholder sem esticar texto sobre a arena.
  // Guardar o src permite recuperar naturalmente quando o Pokémon troca.
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const broken = src !== null && failedSrc === src

  // Nocaute é ESTADO, não evento: enquanto o Pokémon ativo segue com HP 0, ele
  // permanece em campo desmaiado (opacity/tilt fixos) até a troca. Isso evita
  // que o visual dependa do timing da fila de eventos (sumir ou "ressuscitar").
  const fainted = Boolean(player && player.pokemon && player.hp <= 0)

  useEffect(() => {
    const element = spriteRef.current
    if (!element) return
    const isRemount = previousSrc.current === null && src !== null
    if (previousSrc.current === src && !isRemount) return
    previousSrc.current = src
    // A troca de estado é imediata no servidor. Animar a saída com um callback
    // assíncrono deixava um callback antigo esconder o novo Pokémon; a entrada
    // é atômica e sempre restaura opacity/transform do holder.
    gsap.killTweensOf(element)
    gsap.set(element, { clearProps: 'x,y,rotate,scale,opacity,filter' })
    enterSprite(element, opponent ? 'right' : 'left')
    const dust = element.parentElement
    if (dust && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      burstParticles(dust, 8, 'rgba(200, 205, 230, 0.8)')
    }
  }, [src, opponent, spriteRef])

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
