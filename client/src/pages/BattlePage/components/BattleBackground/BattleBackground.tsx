import { useEffect, useRef, useState } from 'react'
import { markBackgroundFailed, resolveBackground } from '../../../../config/battleBackgrounds'
import type { BattleBackgroundConfig } from '../../../../config/battleBackgrounds'
import styles from './BattleBackground.module.css'

export interface BattleBackgroundProps {
  background: string | null
}

function ArenaScene({ config }: { config: BattleBackgroundConfig }) {
  const scene = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const update = () => {
      if (scene.current) scene.current.dataset.hidden = String(document.hidden)
    }
    update()
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])
  const background = failed ? null : config.background
  return (
    <div
      ref={scene}
      className={`${styles.scene} ${styles[`theme-${config.theme}`]}`}
      data-background={config.id}
      data-arena-name={config.name}
      data-arena-fallback={background ? undefined : 'true'}
      aria-hidden="true"
    >
      <div className={styles.fallback} />
      {background && (
        <img
          className={styles.art}
          src={background}
          alt=""
          draggable={false}
          decoding="async"
          onError={() => {
            markBackgroundFailed(background)
            setFailed(true)
          }}
        />
      )}
      <div
        className={`${styles.atmosphere} ${config.animation ? styles[`ambient-${config.animation}`] : ''}`}
      >
        {Array.from({ length: 6 }, (_, index) => (
          <span
            key={index}
            style={{
              left: `${9 + index * 16}%`,
              top: `${14 + (index % 3) * 19}%`,
              animationDelay: `${index * -1.7}s`,
            }}
          />
        ))}
      </div>
      <div className={config.overlay === 'dark' ? styles.overlayDark : styles.overlaySoft} />
    </div>
  )
}

/** Keyed lifecycle also clears an earlier image error when the room chooses a new arena. */
export function BattleBackground({ background }: BattleBackgroundProps) {
  const config = resolveBackground(background)
  return <ArenaScene key={config.id} config={config} />
}
