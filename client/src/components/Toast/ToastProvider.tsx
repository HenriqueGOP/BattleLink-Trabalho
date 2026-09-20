import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { audio } from '../../lib/audio'
import styles from './Toast.module.css'

export type ToastTone = 'error' | 'info' | 'success'

interface ToastItem {
  id: number
  message: string
  tone: ToastTone
}

interface ToastApi {
  toast: (message: string, tone?: ToastTone) => void
}

const ToastContext = createContext<ToastApi | null>(null)

const AUTO_DISMISS_MS = 4000

/** Provedor de toasts empilháveis — substitui banners estáticos de erro. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setToasts(current => current.filter(item => item.id !== id))
  }, [])

  const toast = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const id = nextId.current++
      audio.play(tone === 'error' ? 'error' : 'toast')
      setToasts(current => [...current.slice(-3), { id, message, tone }])
      window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS)
    },
    [dismiss],
  )

  const api = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className={styles.stack} aria-live="polite" role="status">
        {toasts.map(item => (
          <p key={item.id} className={`${styles.toast} ${styles[item.tone]}`}>
            <span className={styles.dot} aria-hidden="true" />
            <span className={styles.message}>{item.message}</span>
            <button className={styles.close} onClick={() => dismiss(item.id)} aria-label="Fechar aviso">
              ×
            </button>
          </p>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast precisa estar dentro de <ToastProvider>.')
  return context
}
