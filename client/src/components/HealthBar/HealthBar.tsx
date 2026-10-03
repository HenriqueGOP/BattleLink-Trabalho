import { memo } from 'react'
import styles from './HealthBar.module.css'

export interface HealthBarProps {
  value: number
  max: number
  label?: string
  compact?: boolean
}

/** O diretor anima transform; React confirma o valor e a acessibilidade ao concluir o hit. */
export const HealthBar = memo(function HealthBar({
  value,
  max,
  label,
  compact = false,
}: HealthBarProps) {
  const safeMax = Math.max(1, max)
  const hp = Math.max(0, Math.min(Math.max(0, max), value))
  const ratio = hp / safeMax
  const tone = ratio > 0.5 ? 'green' : ratio > 0.2 ? 'yellow' : 'red'
  const scale = { transform: `scaleX(${ratio})` }
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
          aria-valuemax={Math.max(0, max)}
          aria-valuenow={hp}
          aria-label="Pontos de vida"
        >
          <span className={styles.ghost} data-hp-ghost style={scale} />
          <span className={`${styles.fill} ${styles[tone]}`} data-hp-fill style={scale} />
        </div>
      </div>
      {label && (
        <b className={styles.number} aria-hidden="true">
          {hp}
          <i>/</i>
          {max}
        </b>
      )}
    </div>
  )
})
