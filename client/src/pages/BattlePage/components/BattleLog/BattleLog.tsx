import { memo } from 'react'
import styles from './BattleLog.module.css'
import type { LogCategory, LogEntry } from '../../../../types/events'

const LABELS: Record<LogCategory, string> = {
  damage: 'DANO',
  heal: 'CURA',
  status: 'STATUS',
  stat: 'STAT',
  switch: 'TROCA',
  faint: 'K.O.',
  miss: 'ERRO',
  field: 'CAMPO',
  result: 'FIM',
  info: 'INFO',
}

export interface BattleLogProps {
  entries: LogEntry[]
}

/** Feed do registro de combate com tags coloridas por categoria. */
export const BattleLog = memo(function BattleLog({ entries }: BattleLogProps) {
  const visible = entries.slice(-40).reverse()

  return (
    <section className={styles.panel} aria-label="Registro de combate">
      <header className={styles.header}>
        <h2 className={styles.title}>Registro de combate</h2>
        <span className={styles.count}>{entries.length} eventos</span>
      </header>
      <ol className={styles.list}>
        {visible.map(entry => (
          <li key={entry.id} className={`${styles.item} ${styles[entry.category]}`}>
            <b className={styles.tag} aria-hidden="true">
              {LABELS[entry.category]}
            </b>
            <span className={styles.text}>{entry.text}</span>
          </li>
        ))}
        {entries.length === 0 && <li className={styles.empty}>A batalha aparece aqui em tempo real.</li>}
      </ol>
    </section>
  )
})