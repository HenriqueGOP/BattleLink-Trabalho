import { useState, useSyncExternalStore } from 'react'
import { menuArtworkMetrics, resolveBattleSprite } from '../../../../lib/assets'
import { motionProfile } from '../../../../lib/presentation/motionProfiles'
import { useMotionPreference } from '../../../../hooks/useMotionPreference'
import styles from './BattleSprite.module.css'
import type { Player } from '../../../../types/player'
import { spriteAnchorLayout, spriteLayout } from '../../../../lib/presentation/sceneLayout'

export interface BattleSpriteProps {
  player: Player | null
  opponent: boolean
  /** Ref de referência para as animações de evento (GSAP). */
  spriteRef: React.RefObject<HTMLDivElement | null>
  paused?: boolean
}

function subscribeVisibility(listener: () => void) {
  document.addEventListener('visibilitychange', listener)
  return () => document.removeEventListener('visibilitychange', listener)
}
const hiddenSnapshot = () => document.hidden

/** Corpo, orientação, idle e ação têm transformações independentes. */
export function BattleSprite({ player, opponent, spriteRef, paused = false }: BattleSpriteProps) {
  const { reduced } = useMotionPreference()
  const hidden = useSyncExternalStore(subscribeVisibility, hiddenSnapshot, () => false)
  const asset = resolveBattleSprite(
    player?.pokemon ?? '',
    opponent,
    Boolean(player?.pokemonData?.isShiny)
  )
  const status = player?.pokemonData?.status ?? ''
  const fainted = Boolean(player?.pokemonData?.fainted)
  // GIFs nativos não podem ser pausados por CSS; a imagem estática local preserva a pose.
  const still = reduced || hidden || paused || fainted || status === 'freeze' || status === 'sleep'
  const src = still ? asset.staticSrc : asset.src
  // Falhas do recurso local usam um placeholder sem esticar texto sobre a arena.
  // Guardar o src permite recuperar naturalmente quando o Pokémon troca.
  const [failedSources, setFailedSources] = useState<ReadonlySet<string>>(() => new Set())
  const source =
    [src, asset.staticSrc, asset.fallbackSrc].find((candidate) => !failedSources.has(candidate)) ??
    asset.fallbackSrc
  const broken = failedSources.has(source)

  // A flag apresentada muda após o evento faint; HP zero não antecipa a queda.
  // A pose persiste até a troca, inclusive após cancelamento ou ressincronização.
  const animated = asset.animated && !still && source === asset.src

  return (
    <div
      ref={spriteRef}
      className={styles.holder}
      data-pokemon={player?.pokemon ?? undefined}
      data-fainted={fainted ? 'true' : undefined}
      data-battle-anchor={opponent ? 'opponent' : 'me'}
      data-motion-profile={motionProfile(player?.pokemon ?? '')}
      data-motion-reduced={reduced ? 'true' : undefined}
      data-motion-paused={hidden || paused ? 'true' : undefined}
      data-motion-status={status || undefined}
      data-native-animation={animated ? 'true' : undefined}
    >
      <div className={styles.action} data-motion-action>
        <div className={styles.idle} data-motion-idle>
          <div
            className={`${styles.orientation} ${(animated ? asset.mirrored : asset.staticMirrored) ? styles.mirrored : ''}`}
            data-motion-orientation
            data-static-mirrored={asset.staticMirrored ? 'true' : 'false'}
          >
            {source && !broken ? (
              <img
                key={source}
                className={styles.sprite}
                style={spriteLayout(source, asset.staticSrc)}
                src={source}
                data-creature-sprite
                data-sprite-source={menuArtworkMetrics(source) ? 'artwork' : 'pixel'}
                data-static-src={
                  failedSources.has(asset.staticSrc) ? asset.fallbackSrc : asset.staticSrc
                }
                /* alt vazio + role de apresentacao: o nome ja aparece no HUD e na
             legenda, e um alt longo virava texto solto quando a imagem falhava */
                alt=""
                width={96}
                height={96}
                loading="eager"
                decoding="async"
                onError={() => setFailedSources((previous) => new Set([...previous, source]))}
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
          </div>
          {(['body', 'head', 'feet'] as const).map((kind) => (
            <span
              key={kind}
              className={styles.anchor}
              data-sprite-anchor={kind}
              style={spriteAnchorLayout(source, kind, asset.staticSrc)}
              aria-hidden="true"
            />
          ))}
        </div>
      </div>
      {player?.pokemonData?.isShiny && (
        <span className={styles.sparkle} role="img" aria-label="Pokémon shiny" />
      )}
    </div>
  )
}
