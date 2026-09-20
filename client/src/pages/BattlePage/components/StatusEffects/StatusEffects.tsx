import { memo } from 'react'
import { STATUS_LABELS, STATUS_TONE } from '../shared'
import styles from './StatusEffects.module.css'

export interface StatusEffectsProps {
  status: string | null | undefined
  /** Confusão é volátil — pode ser sinalizada por eventos (não vem no snapshot). */
  confusion?: boolean
  compact?: boolean
}

/** Badges de status coloridos com rótulo de texto (informação não é só cor). */
export const StatusEffects = memo(function StatusEffects({
  status,
  confusion = false,
  compact = false,
}: StatusEffectsProps) {
  if (!status && !confusion) return null
  return (
    <span className={compact ? `${styles.row} ${styles.compact}` : styles.row}>
      {status && (
        <span
          className={`${styles.badge} ${styles[STATUS_TONE[status] ?? 'info']}`}
          role="status"
          aria-label={`Status: ${STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? status}`}
        >
          {STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? status.toUpperCase()}
        </span>
      )}
      {confusion && (
        <span className={`${styles.badge} ${styles.confusion}`} role="status" aria-label="Status: confuso">
          CONFUSO
        </span>
      )}
    </span>
  )
})
