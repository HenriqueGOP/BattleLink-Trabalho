import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildSideContext, classifyLogLine, diffState } from '../lib/eventEngine'
import type { BattleEvent, LogEntry } from '../types/events'
import type { GameState } from '../types/battle'

export interface DamageTotals {
  dealt: number
  received: number
}

export interface BattleEventsApi {
  /** Evento atual sendo animado (null quando a fila termina). */
  current: BattleEvent | null
  /** Pula para o próximo evento imediatamente. */
  skip: () => void
  /** Dano total causado/recebido acumulado na partida (dos diffs). */
  totals: DamageTotals
  /** Log completo já classificado para o painel. */
  logEntries: LogEntry[]
}

/**
 * Consome o diff de snapshots → fila sequencial de eventos para animação e som.
 * A UI reflete o snapshot imediatamente; a fila só conduz o teatro visual.
 */
export function useBattleEvents(
  state: GameState | null,
  myIndex: number,
  roomId: string | null,
): BattleEventsApi {
  const [current, setCurrent] = useState<BattleEvent | null>(null)
  const [totals, setTotals] = useState<DamageTotals>({ dealt: 0, received: 0 })
  const queueRef = useRef<BattleEvent[]>([])
  const prevRef = useRef<GameState | null>(null)
  const idRef = useRef(0)
  const timerRef = useRef<number | null>(null)
  const currentRef = useRef<BattleEvent | null>(null)
  const totalsRef = useRef<DamageTotals>({ dealt: 0, received: 0 })

  const stopTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const advanceRef = useRef<() => void>(() => undefined)
  const advance = useCallback(() => {
    stopTimer()
    const next = queueRef.current.shift() ?? null
    currentRef.current = next
    setCurrent(next)
    if (next) {
      timerRef.current = window.setTimeout(() => advanceRef.current(), next.duration)
    }
  }, [stopTimer])
  useEffect(() => {
    advanceRef.current = advance
  }, [advance])

  // nova partida → zera fila, histórico e acumuladores
  useEffect(() => {
    const handle = window.setTimeout(() => {
      prevRef.current = null
      queueRef.current = []
      currentRef.current = null
      setCurrent(null)
      totalsRef.current = { dealt: 0, received: 0 }
      setTotals({ dealt: 0, received: 0 })
      stopTimer()
    }, 0)
    return () => window.clearTimeout(handle)
  }, [roomId, stopTimer])

  useEffect(() => {
    if (!state || myIndex < 0) return
    const prev = prevRef.current
    prevRef.current = state
    const events = diffState(prev, state, myIndex, () => (idRef.current += 1))
    if (events.length === 0) return

    let dealt = totalsRef.current.dealt
    let received = totalsRef.current.received
    for (const event of events) {
      const amount = event.amount ?? 0
      if (amount <= 0) continue
      if (event.type === 'damage') {
        if (event.actor === 'me' && event.target === 'opponent') dealt += amount
        if (event.actor === 'opponent' && event.target === 'me') received += amount
      } else if (event.type === 'residual' || event.type === 'confusion_hit') {
        if (event.target === 'me') received += amount
      }
    }
    totalsRef.current = { dealt, received }
    setTotals({ dealt, received })

    queueRef.current.push(...events)
    if (!currentRef.current) advance()
  }, [state, myIndex, advance])

  // unmount → cancela timers (fila sequencial cancelável)
  useEffect(() => stopTimer, [stopTimer])

  const logEntries = useMemo<LogEntry[]>(() => {
    if (!state || myIndex < 0) return []
    const context = buildSideContext(state, myIndex)
    return state.log.map((text, index) => ({ id: index, ...classifyLogLine(text, context) }))
  }, [state, myIndex])

  const skip = useCallback(() => {
    if (queueRef.current.length > 0 || currentRef.current) advance()
  }, [advance])

  return { current, skip, totals, logEntries }
}
