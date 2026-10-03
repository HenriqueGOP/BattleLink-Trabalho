import { useEffect, useRef, useState } from 'react'
import { useAudio } from '../../hooks/useAudio'
import { audio } from '../../lib/audio'
import styles from './AudioSettings.module.css'

/** Engrenagem sempre acessível: volumes music/sfx + mutes + som de teste. */
export function AudioSettings() {
  const prefs = useAudio()
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const onClick = (event: MouseEvent) => {
      const target = event.target as Node
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onClick)
    }
  }, [open])

  return (
    <div className={styles.wrap}>
      <button
        ref={buttonRef}
        className={styles.gear}
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Configurações de áudio"
        title="Configurações de áudio"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4Zm8.4-2 1.5-1.2a1 1 0 0 0 .2-1.3l-2-3.4a1 1 0 0 0-1.2-.4l-1.8.7a8.2 8.2 0 0 0-1.6-.9L15.2 3a1 1 0 0 0-1-.8h-4a1 1 0 0 0-1 .8L8.7 5.5c-.6.2-1.1.5-1.6.9l-1.8-.7a1 1 0 0 0-1.2.4l-2 3.4a1 1 0 0 0 .2 1.3L4.8 12l-1.5 1.2a1 1 0 0 0-.2 1.3l2 3.4a1 1 0 0 0 1.2.4l1.8-.7c.5.4 1 .7 1.6.9l.5 2.5a1 1 0 0 0 1 .8h4a1 1 0 0 0 1-.8l.5-2.5c.6-.2 1.1-.5 1.6-.9l1.8.7a1 1 0 0 0 1.2-.4l2-3.4a1 1 0 0 0-.2-1.3L20.4 12Z"
          />
        </svg>
      </button>

      {open && (
        <div ref={panelRef} className={styles.panel} role="dialog" aria-label="Configurações de áudio">
          <h3 className={styles.title}>Áudio</h3>

          <label className={styles.row}>
            <span>Música</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={prefs.musicVolume}
              onChange={event => prefs.setVolume('music', Number(event.target.value))}
              aria-label="Volume da música"
            />
            <b>{Math.round(prefs.musicVolume * 100)}</b>
          </label>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={prefs.musicMuted}
              onChange={event => prefs.setMuted('music', event.target.checked)}
            />
            Silenciar música
          </label>

          <label className={styles.row}>
            <span>Efeitos</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={prefs.sfxVolume}
              onChange={event => prefs.setVolume('sfx', Number(event.target.value))}
              aria-label="Volume dos efeitos"
            />
            <b>{Math.round(prefs.sfxVolume * 100)}</b>
          </label>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={prefs.sfxMuted}
              onChange={event => prefs.setMuted('sfx', event.target.checked)}
            />
            Silenciar efeitos
          </label>

          <button
            className={styles.test}
            onClick={() => {
              audio.setMuted('sfx', false)
              audio.play('select')
            }}
          >
            ♪ Testar som
          </button>
        </div>
      )}
    </div>
  )
}
