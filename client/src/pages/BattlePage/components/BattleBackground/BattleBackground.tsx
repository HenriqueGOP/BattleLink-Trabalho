import { resolveBackground } from '../../../../config/battleBackgrounds'
import styles from './BattleBackground.module.css'

export interface BattleBackgroundProps {
  /** id sorteado pelo servidor (state.field.background) - igual para os dois jogadores */
  background: string | null
}

/**
 * Sistema de cenários em camadas (ordem de profundidade do briefing):
 * céu/fundo → intermediário → chão → atmosfera/animação → overlay de contraste.
 * Círculos, Pokémon, efeitos e HUD ficam ACIMA (no palco).
 * Se bg.png existir em public/backgrounds/<id>/, é usada com cover; senão, o
 * cenário é desenhado por CSS puro (fallback licença-safe, sempre disponível).
 */
export function BattleBackground({ background }: BattleBackgroundProps) {
  const config = resolveBackground(background)
  const themeClass = styles[`theme-${config.theme}`] ?? ''
  const animClass = config.animation ? (styles[`anim-${config.animation}`] ?? '') : ''

  return (
    <div
      className={`${styles.scene} ${themeClass}`}
      data-background={config.id}
      aria-hidden="true"
    >
      {/* camada 1: céu/fundo (imagem quando disponível, senão gradiente do tema) */}
      <div
        className={`${styles.far} ${config.background ? styles.hasImage : ''}`}
        style={config.background ? { backgroundImage: `url(${config.background})` } : undefined}
      />

      {/* camada 2: elementos intermediários (silhuetas/colinas/estalactites por tema) */}
      <div className={styles.mid} />
      <div className={`${styles.midTwo} ${animClass}`} />

      {/* camada 3: chão / área de batalha */}
      <div className={styles.ground} />

      {/* camada 4: atmosfera e animação do cenário (partículas CSS leves) */}
      <div className={`${styles.atmosphere} ${animClass}`}>
        {config.animation === 'leaves' && (
          <>
            {Array.from({ length: 6 }, (_, index) => (
              <span key={index} className={styles.leaf} style={{ animationDelay: `${index * 1.7}s`, left: `${8 + index * 15}%` }} />
            ))}
          </>
        )}
        {config.animation === 'fireflies' && (
          <>
            {Array.from({ length: 7 }, (_, index) => (
              <span key={index} className={styles.firefly} style={{ animationDelay: `${index * 1.3}s`, left: `${6 + index * 13}%`, top: `${18 + (index % 3) * 22}%` }} />
            ))}
          </>
        )}
        {config.animation === 'dust' && (
          <>
            {Array.from({ length: 5 }, (_, index) => (
              <span key={index} className={styles.dust} style={{ animationDelay: `${index * 2.1}s`, left: `${10 + index * 18}%` }} />
            ))}
          </>
        )}
      </div>

      {/* camada 5: overlay de contraste para legibilidade do HUD */}
      {config.overlay && <div className={config.overlay === 'dark' ? styles.overlayDark : styles.overlaySoft} />}
    </div>
  )
}