import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
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
const MAX_TOASTS = 4

interface DismissClock {
  remaining: number
  startedAt: number
  timeout: ReturnType<typeof window.setTimeout> | null
  paused: Set<'hover' | 'focus'>
}

/** Provedor de toasts empilháveis — substitui banners estáticos de erro. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(1)
  const clocks = useRef(new Map<number, DismissClock>())
  const visibleIds = useRef<number[]>([])
  const mounted = useRef(true)

  const clearClock = useCallback((id: number) => {
    const clock = clocks.current.get(id)
    if (clock?.timeout !== null && clock?.timeout !== undefined) window.clearTimeout(clock.timeout)
    clocks.current.delete(id)
  }, [])

  const dismiss = useCallback(
    (id: number) => {
      clearClock(id)
      visibleIds.current = visibleIds.current.filter((currentId) => currentId !== id)
      setToasts((current) => current.filter((item) => item.id !== id))
    },
    [clearClock]
  )

  const resume = useCallback(
    (id: number, reason?: 'hover' | 'focus') => {
      const clock = clocks.current.get(id)
      if (!clock) return
      if (reason) clock.paused.delete(reason)
      if (clock.paused.size || clock.timeout !== null || !mounted.current) return
      clock.startedAt = performance.now()
      clock.timeout = window.setTimeout(() => dismiss(id), clock.remaining)
    },
    [dismiss]
  )

  const pause = useCallback((id: number, reason: 'hover' | 'focus') => {
    const clock = clocks.current.get(id)
    if (!clock) return
    clock.paused.add(reason)
    if (clock.timeout === null) return
    window.clearTimeout(clock.timeout)
    clock.timeout = null
    clock.remaining = Math.max(0, clock.remaining - (performance.now() - clock.startedAt))
  }, [])

  useEffect(() => {
    mounted.current = true
    for (const id of clocks.current.keys()) resume(id)
    const ownedClocks = clocks.current
    return () => {
      mounted.current = false
      for (const clock of ownedClocks.values()) {
        if (clock.timeout === null) continue
        window.clearTimeout(clock.timeout)
        clock.timeout = null
        clock.remaining = Math.max(0, clock.remaining - (performance.now() - clock.startedAt))
      }
    }
  }, [resume])

  const toast = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      if (!mounted.current) return
      const id = nextId.current++
      audio.play(tone === 'error' ? 'error' : 'toast')
      const evicted =
        visibleIds.current.length >= MAX_TOASTS ? visibleIds.current.shift() : undefined
      if (evicted !== undefined) clearClock(evicted)
      visibleIds.current.push(id)
      setToasts((current) => [
        ...current.filter((item) => item.id !== evicted),
        { id, message, tone },
      ])
      // Erros permanecem disponíveis; avisos transitórios pausam ao receber foco ou mouse.
      if (tone !== 'error') {
        clocks.current.set(id, {
          remaining: AUTO_DISMISS_MS,
          startedAt: 0,
          timeout: null,
          paused: new Set(),
        })
        resume(id)
      }
    },
    [clearClock, resume]
  )

  const api = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <section className={styles.stack} aria-label="Avisos">
        {toasts.map((item) => (
          <div
            key={item.id}
            className={`${styles.toast} ${styles[item.tone]}`}
            role={item.tone === 'error' ? 'alert' : 'status'}
            aria-atomic="true"
            onMouseEnter={() => pause(item.id, 'hover')}
            onMouseLeave={() => resume(item.id, 'hover')}
            onFocusCapture={() => pause(item.id, 'focus')}
            onBlurCapture={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) resume(item.id, 'focus')
            }}
          >
            <span className={styles.dot} aria-hidden="true" />
            <span className={styles.message}>{item.message}</span>
            <button
              type="button"
              className={styles.close}
              onClick={() => dismiss(item.id)}
              aria-label="Fechar aviso"
            >
              ×
            </button>
          </div>
        ))}
      </section>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast precisa estar dentro de <ToastProvider>.')
  return context
}
