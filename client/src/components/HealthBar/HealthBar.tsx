import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from '../../lib/anim/gsap'
import styles from './HealthBar.module.css'

export interface HealthBarProps {
  value: number
  max: number
  /** Quando presente, mostra o contador numérico "atual/máximo" (lado do jogador). */
  label?: string
  /** Versão do oponente: mais estreita e sem número, como nos jogos. */
  compact?: boolean
}

/** Verde acima de 50%, amarelo acima de 20%, vermelho abaixo disso. */
function toneOf(ratio: number): 'green' | 'yellow' | 'red' {
  if (ratio > 0.5) return 'green'
  if (ratio > 0.2) return 'yellow'
  return 'red'
}

/**
 * Barra de HP clássica: etiqueta "HP" dourada, trilho escuro e preenchimento
 * que drena da direita para a esquerda trocando de cor em 50% e 20%.
 * (Antes eram corações — visual de Zelda, não de Pokémon.)
 */
export function HealthBar({ value, max, label, compact = false }: HealthBarProps) {
  const safeMax = Math.max(1, max)
  const ratio = Math.max(0, Math.min(1, value / safeMax))
  const tone = toneOf(ratio)

  // O número acompanha a barra em vez de saltar de uma vez.
  const [shown, setShown] = useState(value)
  const shownRef = useRef(value)

  useEffect(() => {
    const from = shownRef.current
    if (prefersReducedMotion() || from === value) {
      shownRef.current = value
      setShown(value)
      return
    }
    const started = performance.now()
    const duration = 600
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / duration)
      const eased = 1 - Math.pow(1 - t, 2)
      const current = Math.round(from + (value - from) * eased)
      shownRef.current = current
      setShown(current)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value])

  const critical = tone === 'red' && value > 0

  return (
    <div className={compact ? `${styles.wrap} ${styles.compact}` : styles.wrap}>
      <div className={styles.barRow}>
        <span className={styles.hpTag} aria-hidden="true">
          HP
        </span>
        <div
          className={styles.track}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={max}
          aria-valuenow={Math.max(0, value)}
          aria-label="Pontos de vida"
        >
          <span
            className={`${styles.fill} ${styles[tone]} ${critical ? styles.critical : ''}`}
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
      </div>
      {label && (
        <b className={styles.number} aria-hidden="true">
          {Math.max(0, shown)}
          <i>/</i>
          {max}
        </b>
      )}
    </div>
  )
}
