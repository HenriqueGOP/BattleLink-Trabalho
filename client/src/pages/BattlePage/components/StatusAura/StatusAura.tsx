import { memo, useEffect, useRef } from 'react'
import { playSprite } from '../../../../lib/presentation/SpriteRenderer'
import { statusClip } from '../../../../lib/presentation/spriteRegistry'
import type { StatusName } from '../../../../types/player'
import styles from './StatusAura.module.css'

export interface StatusAuraProps {
  status: StatusName | null | undefined
  confused?: boolean
  side: 'me' | 'opponent'
  paused?: boolean
}
/** Loops pertencem ao status apresentado e não bloqueiam a fila dos turnos. */
export const StatusAura = memo(function StatusAura({
  status,
  confused = false,
  side,
  paused = false,
}: StatusAuraProps) {
  const holder = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    let controller: AbortController | null = null
    const start = () => {
      controller?.abort()
      controller = new AbortController()
      if (document.hidden || paused) return
      const clip = statusClip(status)
      const options = {
        signal: controller.signal,
        loop: true,
        static: preference.matches,
        position: 'above' as const,
      }
      if (clip) void playSprite(holder.current, clip, options)
      if (confused)
        void playSprite(holder.current, 'confusion', { ...options, delay: side === 'me' ? 0 : 120 })
    }
    start()
    document.addEventListener('visibilitychange', start)
    preference.addEventListener('change', start)
    return () => {
      controller?.abort()
      document.removeEventListener('visibilitychange', start)
      preference.removeEventListener('change', start)
    }
  }, [status, confused, side, paused])
  if (!status && !confused) return null
  return <span ref={holder} className={styles.auraLayer} aria-hidden="true" />
})
