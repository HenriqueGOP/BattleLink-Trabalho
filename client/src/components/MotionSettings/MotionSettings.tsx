import { useId } from 'react'
import { useMotionPreference } from '../../hooks/useMotionPreference'
import type { MotionPreference } from '../../lib/presentation/motionPreference'
import styles from './MotionSettings.module.css'

export function MotionSettings() {
  const id = useId()
  const { preference, setPreference } = useMotionPreference()
  return (
    <label className={styles.control} htmlFor={id}>
      <span>Animações</span>
      <select
        id={id}
        value={preference}
        onChange={(event) => setPreference(event.target.value as MotionPreference)}
        aria-label="Movimento das animações"
      >
        <option value="system">Sistema</option>
        <option value="full">Completo</option>
        <option value="reduced">Reduzido</option>
      </select>
    </label>
  )
}
