import styles from './PokeballSpinner.module.css'

export interface PokeballSpinnerProps {
  size?: number
  label?: string
}

/** Pokébola girando — loading de catálogo, conexão e sorteio. */
export function PokeballSpinner({ size = 44, label = 'Carregando…' }: PokeballSpinnerProps) {
  return (
    <span
      className={styles.wrap}
      role="status"
      aria-label={label}
      style={{ width: size, height: size }}
    >
      <span className={styles.ball} style={{ width: size, height: size }} aria-hidden="true">
        <span className={styles.top} />
        <span className={styles.bottom} />
        <span className={styles.band} />
        <span className={styles.center} />
      </span>
    </span>
  )
}
