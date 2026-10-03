import { memo } from 'react'
import type { CSSProperties } from 'react'
import styles from './TypeBadge.module.css'
import { typeLabel } from '../../lib/format'

export interface TypeBadgeProps {
  type: string
  /** Compacto para espaços apertados (chips, HUD). */
  small?: boolean
}

/** Badges de tipo com a paleta por tipo dos tokens (--type-*). */
export const TypeBadge = memo(function TypeBadge({ type, small = false }: TypeBadgeProps) {
  return (
    <span
      className={small ? `${styles.badge} ${styles.small}` : styles.badge}
      style={{ '--type-color': `var(--type-${type}, var(--type-normal))` } as CSSProperties}
    >
      {typeLabel(type)}
    </span>
  )
})
