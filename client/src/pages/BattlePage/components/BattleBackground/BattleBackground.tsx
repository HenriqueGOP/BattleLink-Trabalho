import { useEffect, useRef, useState } from 'react'
import {
  markBackgroundFailed,
  markBackgroundLoaded,
  resolveBackground,
} from '../../../../config/battleBackgrounds'
import type { BattleBackgroundConfig } from '../../../../config/battleBackgrounds'
import styles from './BattleBackground.module.css'

export interface BattleBackgroundProps {
  background: string | null
}

function ArenaScene({ config }: { config: BattleBackgroundConfig }) {
  const scene = useRef<HTMLDivElement>(null)
  const [source, setSource] = useState<string | null>(config.background ?? config.fallback)
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null)
  const attempts = useRef(0)
  const retryPrimary = () => {
    if (retry.current || attempts.current >= 2) return
    const delay = 1100 * (attempts.current + 1)
    retry.current = setTimeout(() => {
      retry.current = null
      attempts.current++
      setSource(config.primary)
    }, delay)
  }
  useEffect(() => {
    const update = () => {
      if (scene.current) scene.current.dataset.hidden = String(document.hidden)
    }
    update()
    document.addEventListener('visibilitychange', update)
    return () => {
      document.removeEventListener('visibilitychange', update)
      if (retry.current) clearTimeout(retry.current)
    }
  }, [])
  return (
    <div
      ref={scene}
      className={`${styles.scene} ${styles[`theme-${config.theme}`]}`}
      data-background={config.id}
      data-arena-name={config.name}
      data-arena-fallback={source === config.primary ? undefined : 'true'}
      aria-hidden="true"
    >
      <div className={styles.fallback} />
      {source && (
        <img
          className={styles.art}
          src={source}
          alt=""
          draggable={false}
          decoding="async"
          onLoad={() => {
            markBackgroundLoaded(source)
            if (source !== config.primary) retryPrimary()
          }}
          onError={() => {
            markBackgroundFailed(source)
            setSource(source === config.primary ? config.fallback : null)
            retryPrimary()
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
