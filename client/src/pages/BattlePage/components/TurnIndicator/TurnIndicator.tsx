import { useEffect, useRef, useState } from 'react'
import styles from './TurnIndicator.module.css'

export interface TurnIndicatorProps {
  myTurn: boolean
  finished: boolean
  /** Evento de virada de turno — dispara o banner grande. */
  turnEvent: unknown
}

const BANNER_MS = 1400

/** Chip compacto de turno (não cobre o campo) + toast curto na virada. */
export function TurnIndicator({ myTurn, finished, turnEvent }: TurnIndicatorProps) {
  const [toast, setToast] = useState<null | { mine: boolean }>(null)
  const lastEventId = useRef<unknown>(null)

  useEffect(() => {
    // O servidor manda turn_change com targetId; o lado visual (me/opponent) é
    // resolvido no eventEngine. Sem adivinhar pelo texto da mensagem.
    const event = turnEvent as { id?: number; type?: string; target?: 'me' | 'opponent' | 'system' } | null
    if (!event || event.type !== 'turn_change' || lastEventId.current === event.id) return
    lastEventId.current = event.id
    setToast({ mine: event.target === 'me' })
    const timeout = window.setTimeout(() => setToast(null), BANNER_MS)
    return () => window.clearTimeout(timeout)
  }, [turnEvent])

  return (
    <>
      <span
        className={`${styles.chip} ${myTurn ? styles.mine : styles.theirs}`}
        role="status"
        aria-label={finished ? 'Batalha encerrada' : myTurn ? 'Seu turno' : 'Turno do oponente'}
      >
        <i aria-hidden="true" />
        {finished ? 'FIM' : myTurn ? 'SEU TURNO' : 'OPONENTE'}
      </span>

      {toast && <span className={`${styles.pip} ${toast.mine ? styles.mine : styles.theirs}`} aria-hidden="true" />}
    </>
  )
}
